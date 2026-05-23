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
    await telegramCall("sendMessage", {
        chat_id: input.chatId,
        text: truncate(input.text),
        disable_web_page_preview: false,
        ...(input.replyToMessageId ? { reply_to_message_id: input.replyToMessageId } : {}),
        ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    });
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
    replyMarkup?: TelegramReplyMarkup;
}): Promise<void> {
    const artifacts = input.artifacts?.filter((artifact) => artifact.type !== "json") ?? [];
    if (!artifacts.length) {
        await sendTelegramMessage({
            chatId: input.chatId,
            text: input.fallbackText,
            replyToMessageId: input.replyToMessageId,
            replyMarkup: input.replyMarkup,
        });
        return;
    }

    await sendTelegramMessage({
        chatId: input.chatId,
        text: input.fallbackText,
        replyToMessageId: input.replyToMessageId,
        replyMarkup: input.replyMarkup,
    });

    for (const artifact of artifacts.slice(0, 5)) {
        await sendTelegramArtifact({
            chatId: input.chatId,
            artifact,
            replyToMessageId: input.replyToMessageId,
        });
    }
}
