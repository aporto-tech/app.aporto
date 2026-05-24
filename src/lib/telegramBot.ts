import type { StoredArtifact } from "@/lib/artifacts";

const TELEGRAM_API = "https://api.telegram.org";
const MAX_REPLY_CHARS = 3900;

export type TelegramInlineButton = {
    text: string;
    callback_data?: string;
    url?: string;
};

export type TelegramReplyMarkup = {
    inline_keyboard: TelegramInlineButton[][];
};

function truncate(value: string, maxChars = MAX_REPLY_CHARS): string {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars).trim()}...`;
}

function stripMarkdown(text: string): string {
    return text
        // Code fences — keep content, drop the fences
        .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => code.trim())
        .replace(/```[\s\S]*?```/g, (m) => m.slice(3, -3).trim())
        // Inline code — drop backticks
        .replace(/`([^`\n]+)`/g, "$1")
        // Bold **text** or __text__
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_\n]+)__/g, "$1")
        // Markdown headers — remove leading # symbols
        .replace(/^#{1,6}\s+/gm, "")
        // Collapse 3+ blank lines to 2
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function splitIntoChunks(text: string, maxChars = MAX_REPLY_CHARS): string[] {
    if (text.length <= maxChars) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > maxChars) {
        let cut = remaining.lastIndexOf("\n\n", maxChars);
        if (cut <= 0) cut = remaining.lastIndexOf("\n", maxChars);
        if (cut <= 0) cut = remaining.lastIndexOf(" ", maxChars);
        if (cut <= 0) cut = maxChars;
        chunks.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}

export async function telegramCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }
    if (!res.ok) throw new Error(`Telegram ${method} error ${res.status}: ${text}`);
    return data as T;
}

export async function sendTelegramMessage(input: {
    chatId: number | string;
    text: string;
    replyToMessageId?: number;
    replyMarkup?: TelegramReplyMarkup;
}): Promise<void> {
    const chunks = splitIntoChunks(stripMarkdown(input.text));
    for (let i = 0; i < chunks.length; i++) {
        await telegramCall("sendMessage", {
            chat_id: input.chatId,
            text: chunks[i],
            disable_web_page_preview: false,
            ...(i === 0 && input.replyToMessageId ? { reply_to_message_id: input.replyToMessageId } : {}),
            ...(i === chunks.length - 1 && input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
        });
    }
}

export async function sendTelegramChatAction(
    chatId: number | string,
    action: "typing" | "upload_document" | "upload_photo" | "upload_video" | "upload_voice" = "typing",
): Promise<void> {
    await telegramCall("sendChatAction", { chat_id: chatId, action });
}

export async function answerTelegramCallback(callbackQueryId: string, text?: string): Promise<void> {
    await telegramCall("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        ...(text ? { text: truncate(text, 180) } : {}),
    });
}

function artifactMethod(artifact: StoredArtifact): {
    method: "sendPhoto" | "sendVideo" | "sendAudio" | "sendDocument";
    field: "photo" | "video" | "audio" | "document";
    action: "upload_photo" | "upload_video" | "upload_voice" | "upload_document";
} {
    const type = artifact.content_type.toLowerCase();
    if (type.startsWith("image/") && type !== "image/gif") {
        return { method: "sendPhoto", field: "photo", action: "upload_photo" };
    }
    if (type.startsWith("video/") || type === "image/gif") {
        return { method: "sendVideo", field: "video", action: "upload_video" };
    }
    if (type.startsWith("audio/")) {
        return { method: "sendAudio", field: "audio", action: "upload_voice" };
    }
    return { method: "sendDocument", field: "document", action: "upload_document" };
}

export async function sendTelegramArtifact(input: {
    chatId: number | string;
    artifact: StoredArtifact;
    caption?: string;
    replyToMessageId?: number;
}): Promise<void> {
    const target = artifactMethod(input.artifact);
    await sendTelegramChatAction(input.chatId, target.action).catch(() => {});
    await telegramCall(target.method, {
        chat_id: input.chatId,
        [target.field]: input.artifact.url,
        ...(input.caption ? { caption: truncate(input.caption, 900) } : {}),
        ...(input.replyToMessageId ? { reply_to_message_id: input.replyToMessageId } : {}),
    });
}

export async function sendTelegramArtifacts(input: {
    chatId: number | string;
    artifacts?: StoredArtifact[];
    fallbackText: string;
    replyToMessageId?: number;
    includeJson?: boolean;
}): Promise<void> {
    const artifacts = input.artifacts?.filter((artifact) => input.includeJson || artifact.type !== "json") ?? [];
    if (!artifacts.length) {
        if (input.fallbackText.trim()) {
            await sendTelegramMessage({
                chatId: input.chatId,
                text: input.fallbackText,
                replyToMessageId: input.replyToMessageId,
            });
        }
        return;
    }

    if (input.fallbackText.trim()) {
        await sendTelegramMessage({
            chatId: input.chatId,
            text: input.fallbackText,
            replyToMessageId: input.replyToMessageId,
        });
    }

    for (const artifact of artifacts.slice(0, 5)) {
        try {
            await sendTelegramArtifact({
                chatId: input.chatId,
                artifact,
                replyToMessageId: input.replyToMessageId,
            });
        } catch (error) {
            console.error("[telegram] artifact delivery failed:", error);
            await sendTelegramMessage({
                chatId: input.chatId,
                text: `Не удалось прикрепить файл напрямую. Ссылка: ${artifact.url}`,
                replyToMessageId: input.replyToMessageId,
            });
        }
    }
}
