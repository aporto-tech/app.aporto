import { getSkillRun } from "@/lib/skillRuns";
import { prisma } from "@/lib/prisma";
import {
    sendTelegramArtifacts,
    sendTelegramMessage,
    type TelegramReplyMarkup,
} from "@/lib/telegramBot";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.aporto.tech";

type SkillRunResult = Awaited<ReturnType<typeof getSkillRun>>;

export function telegramRunButtons(runId?: string): TelegramReplyMarkup {
    return {
        inline_keyboard: [
            [
                { text: "Retry", callback_data: "retry_last" },
                { text: "Dashboard", url: `${APP_URL}/dashboard` },
            ],
            [
                { text: "Link account", url: `${APP_URL}/settings?tab=api-keys` },
            ],
            ...(runId ? [[{ text: "Open run", url: `${APP_URL}/dashboard?runId=${encodeURIComponent(runId)}` }]] : []),
        ],
    };
}

function textFromResultData(data: unknown): string | null {
    if (typeof data === "string" && data.trim()) return data.trim();
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const object = data as Record<string, unknown>;
    for (const key of ["content", "text", "answer", "message"]) {
        const value = object[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    const choices = object.choices;
    if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
        const message = (choices[0] as { message?: { content?: unknown } }).message;
        if (typeof message?.content === "string" && message.content.trim()) return message.content.trim();
    }
    return null;
}

function isLlmTextResult(result: NonNullable<SkillRunResult>): boolean {
    return result.status === "succeeded" && Boolean(textFromResultData(result.data));
}

export function resultText(result: NonNullable<SkillRunResult>, options: { quietMode?: boolean } = {}): string {
    if (result.status === "needs_selection" && result.choices?.length) {
        return [
            "Нашел несколько похожих скилов. Уточните, какой нужен:",
            ...result.choices.slice(0, 5).map((choice, index) => `${index + 1}. ${choice.name} (skillId ${choice.skillId})`),
        ].join("\n");
    }

    if (result.status === "running" || result.status === "waiting") {
        return [
            "Скил запущен, результат готовится.",
            `runId: ${result.runId}`,
            "Я пришлю результат сюда, когда он будет готов.",
        ].join("\n");
    }

    if (result.status === "failed") {
        return result.error?.message ?? "Не удалось выполнить скил.";
    }

    const textResult = textFromResultData(result.data);
    if (textResult) return textResult;

    const downloadableArtifacts = telegramDownloadableArtifacts(result);
    if (options.quietMode && downloadableArtifacts.length) return "";
    return [
        "Готово.",
        options.quietMode ? null : result.costUSD != null ? `costUSD: ${result.costUSD}` : null,
        downloadableArtifacts.length ? "Файлы отправляю ниже." : null,
    ].filter(Boolean).join("\n");
}

function telegramDownloadableArtifacts(result: NonNullable<SkillRunResult>) {
    if (result.status !== "succeeded") return [];
    const artifacts = result.artifacts ?? [];
    if (isLlmTextResult(result)) return [];
    const nonJson = artifacts.filter((artifact) => artifact.type !== "json");
    if (nonJson.length) return nonJson;
    return artifacts.filter((artifact) => artifact.type === "json");
}

export async function registerTelegramDelivery(input: {
    runId: string;
    telegramUserId: string;
    chatId: number | string;
    replyToMessageId?: number;
}): Promise<void> {
    await prisma.telegramSkillDelivery.upsert({
        where: { runId: input.runId },
        create: {
            runId: input.runId,
            telegramUserId: input.telegramUserId,
            chatId: String(input.chatId),
            replyToMessageId: input.replyToMessageId ?? null,
        },
        update: {
            telegramUserId: input.telegramUserId,
            chatId: String(input.chatId),
            replyToMessageId: input.replyToMessageId ?? null,
            status: "pending",
            lastError: null,
        },
    });
}

export async function sendTelegramRunResult(input: {
    chatId: number | string;
    result: NonNullable<SkillRunResult>;
    replyToMessageId?: number | null;
    quietMode?: boolean;
}): Promise<void> {
    const text = resultText(input.result, { quietMode: input.quietMode });
    if (resultCanSendFiles(input.result)) {
        const artifacts = telegramDownloadableArtifacts(input.result);
        await sendTelegramArtifacts({
            chatId: input.chatId,
            artifacts,
            fallbackText: text,
            replyToMessageId: input.replyToMessageId ?? undefined,
            replyMarkup: telegramRunButtons(input.result.runId),
            includeJson: true,
        });
        return;
    }
    if (!text.trim()) return;
    await sendTelegramMessage({
        chatId: input.chatId,
        text,
        replyToMessageId: input.replyToMessageId ?? undefined,
        replyMarkup: telegramRunButtons(input.result.runId),
    });
}

function resultCanSendFiles(result: NonNullable<SkillRunResult>): result is NonNullable<SkillRunResult> & { artifacts: NonNullable<NonNullable<SkillRunResult>["artifacts"]> } {
    return telegramDownloadableArtifacts(result).length > 0;
}

export async function deliverDueTelegramSkillRuns(input: {
    limit?: number;
    internalBaseUrl?: string;
} = {}): Promise<{ checked: number; sent: number; failed: number; skipped: number; errors: Array<{ runId: string; error: string }> }> {
    const limit = Math.min(50, Math.max(1, input.limit ?? 20));
    const deliveries = await prisma.$queryRawUnsafe<Array<{
        id: string;
        runId: string;
        telegramUserId: string;
        chatId: string;
        replyToMessageId: number | null;
        attempts: number;
    }>>(
        `UPDATE "TelegramSkillDelivery"
         SET status = 'sending',
             attempts = attempts + 1,
             "updatedAt" = NOW()
         WHERE id IN (
             SELECT d.id
             FROM "TelegramSkillDelivery" d
             JOIN "SkillRun" r ON r.id = d."runId"
             WHERE (d.status = 'pending'
                OR (d.status = 'sending' AND d."updatedAt" < NOW() - INTERVAL '10 minutes'))
               AND r.status IN ('succeeded', 'failed')
             ORDER BY d."createdAt" ASC
             FOR UPDATE SKIP LOCKED
             LIMIT $1
         )
         RETURNING id, "runId", "telegramUserId", "chatId", "replyToMessageId", attempts`,
        limit,
    );

    const summary = { checked: 0, sent: 0, failed: 0, skipped: 0, errors: [] as Array<{ runId: string; error: string }> };

    for (const delivery of deliveries) {
        summary.checked += 1;
        const run = await prisma.skillRun.findUnique({
            where: { id: delivery.runId },
            select: { newApiUserId: true, status: true },
        });
        if (!run || !["succeeded", "failed"].includes(run.status)) {
            await prisma.telegramSkillDelivery.update({
                where: { id: delivery.id },
                data: { status: "pending" },
            });
            summary.skipped += 1;
            continue;
        }

        try {
            const conversation = await prisma.telegramConversation.findUnique({
                where: { telegramUserId: delivery.telegramUserId },
                select: { quietMode: true },
            });
            const result = await getSkillRun({
                source: "rest",
                newApiUserId: run.newApiUserId,
                runId: delivery.runId,
                waitForResult: false,
                internalBaseUrl: input.internalBaseUrl,
            });
            if (!result) {
                await prisma.telegramSkillDelivery.update({
                    where: { id: delivery.id },
                    data: { status: "pending" },
                });
                summary.skipped += 1;
                continue;
            }
            await sendTelegramRunResult({
                chatId: delivery.chatId,
                result,
                replyToMessageId: delivery.replyToMessageId,
                quietMode: conversation?.quietMode ?? false,
            });
            await prisma.telegramSkillDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: "sent",
                    sentAt: new Date(),
                    attempts: { increment: 1 },
                    lastError: null,
                },
            });
            summary.sent += 1;
        } catch (error) {
            const message = String(error);
            await prisma.telegramSkillDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: delivery.attempts >= 5 ? "failed" : "pending",
                    lastError: message,
                },
            });
            summary.failed += 1;
            summary.errors.push({ runId: delivery.runId, error: message });
        }
    }

    return summary;
}
