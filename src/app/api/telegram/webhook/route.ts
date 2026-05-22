import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WAIT_SECONDS, runSkill } from "@/lib/skillRuns";
import { discoverSkills } from "@/lib/routing";
import {
    TRIAL_LIMIT_MESSAGE,
    TRIAL_NEWAPI_USER_ID,
    completeAnonymousTrialRun,
    getTrialIpHash,
    reserveAnonymousTrialRun,
} from "@/lib/anonymousTrial";
import { prisma } from "@/lib/prisma";
import { hashTelegramLinkCode } from "@/lib/telegramLink";

export const dynamic = "force-dynamic";

const TELEGRAM_API = "https://api.telegram.org";
const TELEGRAM_MODEL = "google/gemini-2.5-flash-lite";
const MAX_USER_TEXT_CHARS = 1000;
const MAX_SCHEMA_CHARS = 420;
const MAX_REPLY_CHARS = 3900;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.aporto.tech";

type TelegramUpdate = {
    message?: {
        message_id?: number;
        text?: string;
        chat?: { id?: number | string };
        from?: { id?: number; username?: string; first_name?: string };
    };
};

type LinkedTelegramAccount = {
    userId: string;
    newApiUserId: number;
    telegramUserId: string;
};

type TelegramPlan = {
    action?: "run_skill" | "ask_clarification" | "discover" | "help";
    intent?: string;
    skillId?: number | null;
    providerHint?: string | null;
    params?: Record<string, unknown>;
    reply?: string;
};

function truncate(value: string, maxChars: number): string {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars).trim()}...`;
}

function parseJsonObject(value: string): TelegramPlan {
    const cleaned = value.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
        const parsed = JSON.parse(cleaned) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as TelegramPlan : {};
    } catch {
        return {};
    }
}

function systemPrompt(): string {
    return [
        "You are Aporto's Telegram skill router.",
        "Your job is to turn one Telegram message into a tiny JSON plan for running an API skill.",
        "Return only valid JSON. No markdown. No prose.",
        "Use only the candidate skills provided by the server when choosing skillId.",
        "Keep params minimal and literal. Do not invent URLs, files, emails, phone numbers, credentials, or missing required inputs.",
        "If the user asks what is available, asks a broad question, or candidates are weak, choose discover.",
        "If required params are missing, choose ask_clarification and ask exactly one short question.",
        "For media generation, put the user's creative request in params.prompt.",
        "For text-to-speech, put speakable text in params.text.",
        "For search/scraping, preserve the user's query in params.query unless a candidate schema clearly needs another key.",
        "Schema: {\"action\":\"run_skill|ask_clarification|discover|help\",\"intent\":\"short skill intent\",\"skillId\":number|null,\"providerHint\":string|null,\"params\":object,\"reply\":\"short user-facing Russian or English message\"}",
    ].join(" ");
}

function buildPlannerPrompt(userText: string, candidates: Awaited<ReturnType<typeof discoverSkills>>): string {
    const compactCandidates = candidates.slice(0, 5).map((skill) => ({
        id: skill.id,
        name: skill.name,
        category: skill.category,
        priceUSD: skill.priceUSD,
        trialAvailable: skill.trialAvailable,
        paramsSchema: skill.paramsSchema ? truncate(skill.paramsSchema, MAX_SCHEMA_CHARS) : null,
    }));

    return JSON.stringify({
        userText: truncate(userText, MAX_USER_TEXT_CHARS),
        candidates: compactCandidates,
    });
}

async function planTelegramRequest(userText: string): Promise<{ plan: TelegramPlan; candidates: Awaited<ReturnType<typeof discoverSkills>> }> {
    const candidates = await discoverSkills(userText, 0);
    const baseUrl = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
    const apiKey = process.env.NEWAPI_ADMIN_KEY;
    if (!apiKey) throw new Error("NEWAPI_ADMIN_KEY is not set");

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: TELEGRAM_MODEL,
            messages: [
                { role: "system", content: systemPrompt() },
                { role: "user", content: buildPlannerPrompt(userText, candidates) },
            ],
            temperature: 0,
            max_tokens: 220,
        }),
    });

    if (!res.ok) throw new Error(`Telegram planner LLM error ${res.status}: ${await res.text()}`);

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    return { plan: parseJsonObject(content), candidates };
}

async function telegramCall(method: string, body: Record<string, unknown>): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Telegram ${method} error ${res.status}: ${await res.text()}`);
}

async function sendMessage(chatId: number | string, text: string, replyToMessageId?: number): Promise<void> {
    await telegramCall("sendMessage", {
        chat_id: chatId,
        text: truncate(text, MAX_REPLY_CHARS),
        disable_web_page_preview: false,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    });
}

async function sendChatAction(chatId: number | string, action: "typing" | "upload_document" = "typing"): Promise<void> {
    await telegramCall("sendChatAction", { chat_id: chatId, action });
}

function helpMessage(): string {
    return [
        "Напишите, что нужно сделать, например:",
        "generate a 720p video of a neon city",
        "найди LinkedIn профили founders AI agencies",
        "озвучь: Welcome to Aporto",
        "",
        "Для привязки аккаунта откройте Settings в Aporto, создайте Telegram code и отправьте сюда /link CODE.",
        "Без привязки Telegram работает через trial. Когда лимит закончится, получите API key на https://aporto.tech.",
    ].join("\n");
}

function telegramLimitMessage(): string {
    return [
        TRIAL_LIMIT_MESSAGE,
        "",
        "Если у вас уже есть аккаунт Aporto:",
        `1. Откройте ${APP_URL}/settings`,
        "2. В блоке Telegram нажмите Create Link Code",
        "3. Отправьте сюда команду /link CODE",
        "",
        "После привязки Telegram будет запускать скилы с вашего Aporto баланса.",
    ].join("\n");
}

function telegramUserIdFor(message: NonNullable<TelegramUpdate["message"]>): string {
    return `telegram:${message.from?.id ?? message.chat?.id}`;
}

async function findLinkedTelegramAccount(telegramUserId: string): Promise<LinkedTelegramAccount | null> {
    const account = await prisma.telegramAccount.findUnique({
        where: { telegramUserId },
        select: { userId: true, newApiUserId: true, telegramUserId: true },
    });
    if (!account) return null;
    await prisma.telegramAccount.update({
        where: { telegramUserId },
        data: { lastSeenAt: new Date() },
    });
    return account;
}

async function linkTelegramAccount(
    code: string,
    message: NonNullable<TelegramUpdate["message"]>,
): Promise<{ success: true; linkedEmail?: string | null } | { success: false; message: string }> {
    const codeHash = hashTelegramLinkCode(code);
    const token = await prisma.telegramLinkToken.findUnique({
        where: { codeHash },
        include: { user: { select: { id: true, email: true, newApiUserId: true } } },
    });

    if (!token || token.usedAt || token.expiresAt <= new Date()) {
        return { success: false, message: "Код недействителен или истек. Создайте новый код в Aporto Settings." };
    }
    if (!token.user.newApiUserId) {
        return { success: false, message: "У аккаунта Aporto еще нет NewAPI user id. Завершите регистрацию и попробуйте снова." };
    }

    const telegramUserId = telegramUserIdFor(message);
    const chatId = String(message.chat?.id ?? "");
    if (!chatId) return { success: false, message: "Не удалось определить Telegram chat id." };

    await prisma.$transaction(async (tx) => {
        await tx.telegramAccount.deleteMany({
            where: {
                userId: token.userId,
                telegramUserId: { not: telegramUserId },
            },
        });
        await tx.telegramAccount.upsert({
            where: { telegramUserId },
            create: {
                userId: token.userId,
                newApiUserId: token.user.newApiUserId!,
                telegramUserId,
                chatId,
                username: message.from?.username ?? null,
                firstName: message.from?.first_name ?? null,
                linkedAt: new Date(),
                lastSeenAt: new Date(),
            },
            update: {
                userId: token.userId,
                newApiUserId: token.user.newApiUserId!,
                chatId,
                username: message.from?.username ?? null,
                firstName: message.from?.first_name ?? null,
                linkedAt: new Date(),
                lastSeenAt: new Date(),
            },
        });
        await tx.telegramLinkToken.update({
            where: { id: token.id },
            data: { usedAt: new Date() },
        });
    });

    return { success: true, linkedEmail: token.user.email };
}

function discoverMessage(candidates: Awaited<ReturnType<typeof discoverSkills>>): string {
    if (!candidates.length) return "Не нашел подходящих скилов. Попробуйте описать задачу конкретнее.";
    return [
        "Подходящие скилы:",
        ...candidates.slice(0, 5).map((skill, index) => {
            const price = skill.priceUSD == null ? "" : ` — $${Number(skill.priceUSD).toFixed(4)}`;
            return `${index + 1}. ${skill.name}${price}`;
        }),
        "",
        "Напишите задачу более конкретно, и я запущу подходящий скил.",
    ].join("\n");
}

function resultMessage(result: Awaited<ReturnType<typeof runSkill>>): string {
    if (result.status === "needs_selection" && result.choices?.length) {
        return [
            "Нашел несколько похожих скилов. Уточните, какой нужен:",
            ...result.choices.slice(0, 5).map((choice, index) => `${index + 1}. ${choice.name} (skillId ${choice.skillId})`),
        ].join("\n");
    }

    if (result.status === "running" || result.status === "waiting") {
        return [
            "Скил запущен, результат еще готовится.",
            `runId: ${result.runId}`,
            "Я пока не умею сам присылать follow-up из Telegram, поэтому повторите запрос позже через веб/API. Скоро добавим авто-уведомление.",
        ].join("\n");
    }

    if (result.status === "failed") {
        return result.error?.message ?? "Не удалось выполнить скил.";
    }

    const urls = result.artifacts?.map((artifact) => artifact.url).filter(Boolean) ?? [];
    return [
        "Готово.",
        result.costUSD != null ? `costUSD: ${result.costUSD}` : null,
        ...urls.slice(0, 5),
    ].filter(Boolean).join("\n");
}

export async function POST(req: NextRequest) {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const actualSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (expectedSecret && actualSecret !== expectedSecret) {
        return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await req.json() as TelegramUpdate;
    const message = update.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();
    if (!chatId || !text) return NextResponse.json({ ok: true });

    if (text === "/start" || text === "/help") {
        await sendMessage(chatId, helpMessage(), message.message_id);
        return NextResponse.json({ ok: true });
    }
    if (text.toLowerCase().startsWith("/link")) {
        const code = text.split(/\s+/)[1];
        if (!code) {
            await sendMessage(chatId, "Отправьте код так: /link ABC123. Код создается в Aporto Settings.", message.message_id);
            return NextResponse.json({ ok: true });
        }
        const linked = await linkTelegramAccount(code, message);
        await sendMessage(
            chatId,
            linked.success
                ? `Telegram подключен к Aporto${linked.linkedEmail ? ` (${linked.linkedEmail})` : ""}. Теперь запуски идут с вашего аккаунта.`
                : linked.message,
            message.message_id,
        );
        return NextResponse.json({ ok: true });
    }
    if (text === "/unlink") {
        const telegramUserId = telegramUserIdFor(message);
        await prisma.telegramAccount.deleteMany({ where: { telegramUserId } });
        await sendMessage(chatId, "Telegram отвязан от Aporto. Следующие запуски пойдут через trial.", message.message_id);
        return NextResponse.json({ ok: true });
    }

    let reservedUsageId: string | null = null;
    let reservedSkillId: number | null = null;

    try {
        await sendChatAction(chatId);
        const { plan, candidates } = await planTelegramRequest(text);

        if (plan.action === "help") {
            await sendMessage(chatId, helpMessage(), message.message_id);
            return NextResponse.json({ ok: true });
        }
        if (plan.action === "ask_clarification") {
            await sendMessage(chatId, plan.reply || "Уточните, какой результат нужен?", message.message_id);
            return NextResponse.json({ ok: true });
        }
        if (plan.action === "discover" || plan.action !== "run_skill") {
            await sendMessage(chatId, plan.reply || discoverMessage(candidates), message.message_id);
            return NextResponse.json({ ok: true });
        }

        const telegramUserId = telegramUserIdFor(message);
        const linkedAccount = await findLinkedTelegramAccount(telegramUserId);
        if (linkedAccount) {
            await sendChatAction(chatId, "upload_document");
            const result = await runSkill({
                source: "rest",
                newApiUserId: linkedAccount.newApiUserId,
                authHeader: "",
                internalBaseUrl: req.nextUrl.origin,
                intent: plan.intent || text,
                params: plan.params && typeof plan.params === "object" ? plan.params : {},
                skillId: typeof plan.skillId === "number" ? plan.skillId : undefined,
                providerHint: plan.providerHint || undefined,
                waitForResult: true,
                maxWaitSeconds: DEFAULT_WAIT_SECONDS,
                sessionId: `telegram-linked-${linkedAccount.newApiUserId}-${new Date().toISOString().slice(0, 10)}`,
                billingMode: "paid",
                trialOnly: false,
            });
            await sendMessage(chatId, resultMessage(result), message.message_id);
            return NextResponse.json({ ok: true });
        }

        const reservation = await reserveAnonymousTrialRun({
            anonymousClientId: telegramUserId,
            source: "telegram",
            externalUserId: telegramUserId,
            ipHash: getTrialIpHash(req),
            skillId: typeof plan.skillId === "number" ? plan.skillId : null,
            enforceIpLimit: false,
        });
        if (!reservation.allowed) {
            await sendMessage(chatId, telegramLimitMessage(), message.message_id);
            return NextResponse.json({ ok: true });
        }
        reservedUsageId = reservation.usageId;
        reservedSkillId = typeof plan.skillId === "number" ? plan.skillId : null;

        await sendChatAction(chatId, "upload_document");
        const result = await runSkill({
            source: "rest",
            newApiUserId: TRIAL_NEWAPI_USER_ID,
            authHeader: "",
            internalBaseUrl: req.nextUrl.origin,
            intent: plan.intent || text,
            params: plan.params && typeof plan.params === "object" ? plan.params : {},
            skillId: typeof plan.skillId === "number" ? plan.skillId : undefined,
            providerHint: plan.providerHint || undefined,
            waitForResult: true,
            maxWaitSeconds: DEFAULT_WAIT_SECONDS,
            sessionId: `telegram-${reservation.usageId}`,
            billingMode: "trial",
            trialOnly: false,
        });

        await completeAnonymousTrialRun({
            usageId: reservation.usageId,
            status: result.status,
            skillId: result.skillId || plan.skillId || null,
            runId: result.runId,
        });

        await sendMessage(chatId, resultMessage(result), message.message_id);
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (reservedUsageId) {
            await completeAnonymousTrialRun({
                usageId: reservedUsageId,
                status: "error",
                skillId: reservedSkillId,
            }).catch(() => {});
        }
        console.error("[telegram/webhook] error:", error);
        await sendMessage(chatId, `Ошибка: ${String(error)}`, message.message_id).catch(() => {});
        return NextResponse.json({ ok: true });
    }
}
