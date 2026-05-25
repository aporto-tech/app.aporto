import { randomUUID } from "crypto";
import { artifactExpiresAt, uploadToR2 } from "@/lib/r2";
import { telegramCall } from "@/lib/telegramBot";

type TelegramFileRef = {
    file_id?: string;
    file_unique_id?: string;
    file_name?: string;
    file_size?: number;
    mime_type?: string;
};

type TelegramPhotoSize = TelegramFileRef & {
    width?: number;
    height?: number;
};

export type TelegramMessageWithFiles = {
    text?: string;
    caption?: string;
    document?: TelegramFileRef;
    photo?: TelegramPhotoSize[];
    video?: TelegramFileRef;
    audio?: TelegramFileRef;
    voice?: TelegramFileRef;
    animation?: TelegramFileRef;
};

export type TelegramUploadedAttachment = {
    url: string;
    filename: string;
    contentType: string;
    size: number;
    kind: string;
};

type TelegramGetFileResponse = {
    result?: {
        file_id?: string;
        file_unique_id?: string;
        file_size?: number;
        file_path?: string;
    };
};

type AttachmentCandidate = {
    kind: string;
    fileId: string;
    uniqueId?: string;
    filename?: string;
    contentType?: string;
    size?: number;
};

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export function telegramMessageText(message: TelegramMessageWithFiles): string {
    return (message.text ?? message.caption ?? "").trim();
}

export function hasTelegramAttachments(message: TelegramMessageWithFiles): boolean {
    return attachmentCandidates(message).length > 0;
}

export function telegramAttachmentParams(attachments: TelegramUploadedAttachment[]): Record<string, unknown> {
    if (!attachments.length) return {};
    const urls = attachments.map((attachment) => attachment.url);
    const firstUrl = urls[0];
    return {
        fileInput: urls.length === 1 ? firstUrl : urls,
        file: firstUrl,
        fileUrl: firstUrl,
        fileUrls: urls,
        attachments,
    };
}

export async function uploadTelegramAttachments(
    message: TelegramMessageWithFiles,
): Promise<TelegramUploadedAttachment[]> {
    const candidates = attachmentCandidates(message);
    const uploaded: TelegramUploadedAttachment[] = [];

    for (const candidate of candidates) {
        uploaded.push(await uploadTelegramAttachment(candidate));
    }

    return uploaded;
}

function attachmentCandidates(message: TelegramMessageWithFiles): AttachmentCandidate[] {
    const candidates: AttachmentCandidate[] = [];
    if (message.document?.file_id) {
        candidates.push({
            kind: "document",
            fileId: message.document.file_id,
            uniqueId: message.document.file_unique_id,
            filename: message.document.file_name,
            contentType: message.document.mime_type,
            size: message.document.file_size,
        });
    }

    const photo = largestPhoto(message.photo);
    if (photo?.file_id) {
        candidates.push({
            kind: "photo",
            fileId: photo.file_id,
            uniqueId: photo.file_unique_id,
            filename: `telegram-photo-${photo.file_unique_id ?? photo.file_id}.jpg`,
            contentType: "image/jpeg",
            size: photo.file_size,
        });
    }

    for (const kind of ["video", "audio", "voice", "animation"] as const) {
        const file = message[kind];
        if (!file?.file_id) continue;
        candidates.push({
            kind,
            fileId: file.file_id,
            uniqueId: file.file_unique_id,
            filename: file.file_name,
            contentType: file.mime_type,
            size: file.file_size,
        });
    }

    return candidates;
}

function largestPhoto(photos?: TelegramPhotoSize[]): TelegramPhotoSize | undefined {
    if (!photos?.length) return undefined;
    return [...photos].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
}

async function uploadTelegramAttachment(candidate: AttachmentCandidate): Promise<TelegramUploadedAttachment> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

    const file = await telegramCall<TelegramGetFileResponse>("getFile", { file_id: candidate.fileId });
    const filePath = file.result?.file_path;
    if (!filePath) throw new Error("Telegram did not return file_path for attachment");

    const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
        signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
        throw new Error(`Telegram file download failed: ${res.status}`);
    }

    const contentType = candidate.contentType
        ?? res.headers.get("content-type")
        ?? contentTypeFromFilename(candidate.filename)
        ?? DEFAULT_CONTENT_TYPE;
    const body = Buffer.from(await res.arrayBuffer());
    const filename = safeFilename(candidate.filename ?? filenameFromPath(filePath) ?? `${candidate.kind}${extensionFor(contentType)}`);
    const key = `telegram/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${filename}`;
    const url = await uploadToR2(key, body, contentType, { expiresAt: artifactExpiresAt() });

    return {
        url,
        filename,
        contentType,
        size: body.byteLength || candidate.size || file.result?.file_size || 0,
        kind: candidate.kind,
    };
}

function filenameFromPath(path: string): string | undefined {
    const name = path.split("/").pop();
    return name || undefined;
}

function safeFilename(value: string): string {
    const cleaned = value
        .replace(/[/\\?%*:|"<>]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    return cleaned || "telegram-file";
}

function contentTypeFromFilename(filename?: string): string | undefined {
    const lower = filename?.toLowerCase();
    if (!lower) return undefined;
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".mp4")) return "video/mp4";
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    if (lower.endsWith(".wav")) return "audio/wav";
    return undefined;
}

function extensionFor(contentType: string): string {
    if (contentType === "application/pdf") return ".pdf";
    if (contentType === "image/png") return ".png";
    if (contentType === "image/jpeg") return ".jpg";
    if (contentType === "image/webp") return ".webp";
    if (contentType === "image/gif") return ".gif";
    if (contentType === "video/mp4") return ".mp4";
    if (contentType === "audio/mpeg") return ".mp3";
    if (contentType === "audio/wav") return ".wav";
    return ".bin";
}
