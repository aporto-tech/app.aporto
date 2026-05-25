import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { runSkill } from "@/lib/skillRuns";
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
import {
    answerTelegramCallback,
    sendTelegramChatAction,
    sendTelegramMessage,
} from "@/lib/telegramBot";
import {
    registerTelegramDelivery,
    resultText,
    sendTelegramRunResult,
} from "@/lib/telegramDelivery";
import {
    hasTelegramAttachments,
    telegramAttachmentParams,
    telegramMessageText,
    uploadTelegramAttachments,
    type TelegramMessageWithFiles,
} from "@/lib/telegramFiles";

export const dynamic = "force-dynamic";

const TELEGRAM_MODEL = "deepseek-v4-flash";
const MAX_USER_TEXT_CHARS = 1000;
const MAX_SCHEMA_CHARS = 420;
const MIN_RUN_CONFIDENCE = 0.7;
const PENDING_SELECTION_TTL_MS = 10 * 60 * 1000;
const RUNNING_SKILL_DEDUP_TTL_MS = 30 * 60 * 1000;
const TELEGRAM_SKILL_CHOICES_LIMIT = 10;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.aporto.tech";
const GENERATION_TERMS = /\b(generate|create|make|render|produce|сгенерируй|создай|сделай|нарисуй|создать|генерац)\b/i;
const VIDEO_TERMS = /\b(video|ролик|видео|анимац)\b/i;
const IMAGE_TERMS = /\b(image|photo|picture|картин|изображ|фото)\b/i;
const AUDIO_TERMS = /\b(audio|voice|speech|tts|озвуч|голос|аудио|музык|music|song|песн)\b/i;
const EXTRACTOR_TERMS = /\b(extract|extractor|scrape|scraper|parser|parse|download|downloader|listing|posts?|reviews?|comments?|tiktok|reddit|linkedin|google maps|извлеч|спарс|парс)\b/i;

type TelegramUpdate = {
    update_id?: number;
    message?: {
        message_id?: number;
        text?: string;
        caption?: string;
        chat?: { id?: number | string };
        from?: { id?: number; username?: string; first_name?: string };
    } & TelegramMessageWithFiles;
    callback_query?: {
        id: string;
        data?: string;
        message?: {
            message_id?: number;
            chat?: { id?: number | string };
            text?: string;
        };
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
    confidence?: number | null;
    providerHint?: string | null;
    params?: Record<string, unknown>;
    reply?: string;
};

type TelegramCandidate = Awaited<ReturnType<typeof discoverSkills>>[number] & { priceLabel?: string };

type PendingRunPayload = {
    text: string;
    plan: TelegramPlan;
    candidates: TelegramCandidate[];
    attachmentParams?: Record<string, unknown>;
    page?: number;
    hasMore?: boolean;
};

type TelegramRunDedupPayload = {
    kind: "telegram_run_dedup";
    updateId?: number;
    messageId?: number;
    chatId: string;
    text: string;
    startedAt: string;
    status: "running" | "completed";
};

type TelegramMessageLike = NonNullable<TelegramUpdate["message"]> & {
    from?: { id?: number; username?: string; first_name?: string };
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

function requestedResultLimitFromText(value: string): number | null {
    const patterns = [
        /\b(?:find|collect|get|scrape|return|show|найди|собери|получи|покажи)\s+(\d{1,3})\b/i,
        /\b(\d{1,3})\s+(?:restaurants?|places?|businesses?|companies?|profiles?|leads?|results?|items?|reviews?|ресторан(?:а|ов)?|мест(?:а)?|компани(?:й|и|ю)|профил(?:ей|я)?|лид(?:ов|а)?|результат(?:ов|а)?|отзыв(?:ов|а)?)\b/i,
    ];
    for (const pattern of patterns) {
        const match = value.match(pattern);
        const number = Number(match?.[1]);
        if (Number.isInteger(number) && number > 0 && number <= 500) return number;
    }
    return null;
}

function applyRequestedResultLimit(params: Record<string, unknown>, userText: string): Record<string, unknown> {
    const limit = requestedResultLimitFromText(userText);
    if (limit == null) return params;
    return {
        ...params,
        maxResults: limit,
        maxItems: limit,
        limit,
        resultsLimit: limit,
        maxCrawledPlaces: limit,
        maxCrawledPlacesPerSearch: limit,
    };
}

function systemPrompt(): string {
    return [
        "You are Aporto's Telegram skill router.",
        "Your job is to turn one Telegram message into a tiny JSON plan for running an API skill.",
        "Return only valid JSON. No markdown. No prose.",
        "Use only the candidate skills provided by the server when choosing skillId.",
        "Keep params minimal and literal. Do not invent URLs, files, emails, phone numbers, credentials, or missing required inputs.",
        "Estimate confidence from 0 to 1 that exactly one candidate skill should be executed.",
        "If the user explicitly names a candidate model/skill/resolution/duration, choose that skill and set confidence >= 0.90.",
        "If confidence is below 0.70, do not run a skill. Choose ask_clarification and include 2-5 concrete skill options in reply.",
        "If the user asks what is available, asks a broad question, or candidates are weak, choose discover or ask_clarification.",
        "If required params are missing, choose ask_clarification and ask exactly one short question.",
        "Never choose extractor, scraper, parser, downloader, listing, post, review, TikTok, Reddit, LinkedIn, or Google Maps skills for requests to create/generate media. Those skills read existing content; they do not generate new media.",
        "For create/generate video requests, choose only skills whose name/category/capabilities/output mention video generation, text-to-video, or image-to-video.",
        "For media generation, put the user's creative request in params.prompt.",
        "For LLM/model chat skills, put the user's request in params.prompt. If the user gives a system/developer instruction, put it in params.system. Pass explicit model controls only when the user asks for them: reasoning_effort, reasoning, thinkingFlag, include_thoughts, temperature, max_tokens, response_format, tools.",
        "For text-to-speech, put speakable text in params.text. Do not invent voice_id. If the user names a common voice, use the lowercase voice name, e.g. rachel, adam, bella.",
        "For search/scraping, preserve the user's query in params.query unless a candidate schema clearly needs another key. If the user asks for a concrete number of results, pass that number as maxResults/maxItems/limit.",
        "Schema: {\"action\":\"run_skill|ask_clarification|discover|help\",\"intent\":\"short skill intent\",\"skillId\":number|null,\"confidence\":number,\"providerHint\":\"string|null\",\"params\":object,\"reply\":\"short user-facing Russian or English message\"}",
    ].join(" ");
}

function candidateText(skill: Awaited<ReturnType<typeof discoverSkills>>[number]): string {
    return [
        skill.name,
        skill.description,
        skill.category,
        skill.tags,
        skill.capabilities.join(" "),
        skill.inputTypes.join(" "),
        skill.outputTypes.join(" "),
    ].filter(Boolean).join(" ").toLowerCase();
}

function filterCandidatesForIntent(userText: string, candidates: Awaited<ReturnType<typeof discoverSkills>>) {
    if (!GENERATION_TERMS.test(userText)) return candidates;

    const wantsVideo = VIDEO_TERMS.test(userText);
    const wantsImage = IMAGE_TERMS.test(userText);
    const wantsAudio = AUDIO_TERMS.test(userText);
    const filtered = candidates.filter((skill) => {
        const text = candidateText(skill);
        if (EXTRACTOR_TERMS.test(text)) return false;
        if (wantsVideo) return /video|text-to-video|image-to-video|generate-video|video-generation/.test(text);
        if (wantsImage) return /image|photo|picture|generate-image|image-generation/.test(text);
        if (wantsAudio) return /audio|speech|voice|tts|music|sound|text-to-speech/.test(text);
        return true;
    });

    return filtered.length ? filtered : candidates;
}

function buildPlannerPrompt(userText: string, candidates: TelegramCandidate[]): string {
    const compactCandidates = candidates.slice(0, TELEGRAM_SKILL_CHOICES_LIMIT).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: truncate(skill.description, 180),
        category: skill.category,
        capabilities: skill.capabilities.slice(0, 8),
        inputTypes: skill.inputTypes.slice(0, 5),
        outputTypes: skill.outputTypes.slice(0, 5),
        tags: skill.tags ? truncate(skill.tags, 160) : null,
        matchScore: Number(skill.similarity.toFixed(3)),
        priceUSD: skill.priceUSD,
        trialAvailable: skill.trialAvailable,
        paramsSchema: skill.paramsSchema ? truncate(skill.paramsSchema, MAX_SCHEMA_CHARS) : null,
    }));

    return JSON.stringify({
        userText: truncate(userText, MAX_USER_TEXT_CHARS),
        candidates: compactCandidates,
    });
}

async function telegramDiscoveryPage(userText: string, page: number): Promise<TelegramCandidate[]> {
    return withTelegramPriceLabels(filterCandidatesForIntent(userText, await discoverSkills(userText, page)));
}

async function telegramDiscoveryHasMore(userText: string, page: number): Promise<boolean> {
    return (await telegramDiscoveryPage(userText, page + 1)).length > 0;
}

async function planTelegramRequest(userText: string): Promise<{ plan: TelegramPlan; candidates: TelegramCandidate[]; hasMore: boolean }> {
    const candidates = await telegramDiscoveryPage(userText, 0);
    const hasMore = await telegramDiscoveryHasMore(userText, 0);
    const exactModel = explicitModelCandidate(userText, candidates);
    if (exactModel) {
        return {
            candidates,
            hasMore,
            plan: {
                action: "run_skill",
                intent: exactModel.name,
                skillId: exactModel.id,
                confidence: 0.98,
                providerHint: exactModel.name,
                params: { prompt: extractPromptAfterModelName(userText) },
            },
        };
    }
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
    return { plan: parseJsonObject(content), candidates, hasMore };
}

function helpMessage(): string {
    return [
        "Напишите, что нужно сделать, например:",
        "generate a 720p video of a neon city",
        "найди LinkedIn профили founders AI agencies",
        "озвучь: Welcome to Aporto",
        "",
        "Команды:",
        "/dashboard — открыть Aporto dashboard",
        "/choose — выбрать скил из текущего списка",
        "/more — показать следующие 10 скилов",
        "/quiet on — не присылать служебные сообщения после результата",
        "/quiet off — снова показывать cost/status сообщения",
        "/verbose — выключить quiet mode",
        "/unlink — отвязать Telegram от Aporto",
        "",
        "Для привязки аккаунта откройте Settings → Integrations в Aporto, создайте Telegram code и отправьте сюда /link CODE.",
        "Без привязки Telegram работает через trial. Когда лимит закончится, получите API key на https://aporto.tech.",
    ].join("\n");
}

function telegramLimitMessage(): string {
    return [
        TRIAL_LIMIT_MESSAGE,
        "",
        "Если у вас уже есть аккаунт Aporto:",
        `1. Откройте ${APP_URL}/settings`,
        "2. Откройте вкладку Integrations и в блоке Telegram нажмите Create Link Code",
        "3. Отправьте сюда команду /link CODE",
        "",
        "После привязки Telegram будет запускать скилы с вашего Aporto баланса.",
    ].join("\n");
}

function telegramUserIdFor(message: NonNullable<TelegramUpdate["message"]>): string {
    return `telegram:${message.from?.id ?? message.chat?.id}`;
}

function telegramUserIdForCallback(callback: NonNullable<TelegramUpdate["callback_query"]>): string {
    return `telegram:${callback.from?.id ?? callback.message?.chat?.id}`;
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
    message: TelegramMessageLike,
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

function normalizeModelText(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "");
}

function explicitModelCandidate(userText: string, candidates: TelegramCandidate[]): TelegramCandidate | null {
    const text = normalizeModelText(userText);
    const modelMentioned = /\b(model|модель)\b/i.test(userText)
        || /(haiku|opus|sonnet|claude|gemini|gpt|codex)/i.test(userText);
    if (!modelMentioned) return null;

    const familyChecks: Array<{ family: RegExp; version?: RegExp }> = [
        { family: /haiku/i, version: /4\.?5/i },
        { family: /opus/i, version: /4\.?[567]/i },
        { family: /sonnet/i, version: /4\.?[56]/i },
        { family: /gemini/i, version: /(?:2\.?5|3\.?1|3)/i },
        { family: /gpt/i, version: /5\.?[245]/i },
        { family: /codex/i, version: /5(?:\.?[1234])?/i },
    ];

    for (const candidate of candidates) {
        const name = candidate.name;
        if (!/\b(chat|llm|claude|gpt|gemini|codex)\b/i.test(name)) continue;
        const normalizedName = normalizeModelText(name);
        const matched = familyChecks.some(({ family, version }) => {
            if (!family.test(userText) || !family.test(name)) return false;
            return !version || (version.test(userText) && version.test(name));
        });
        if (matched || normalizedName.includes(text)) return candidate;
    }
    return null;
}

function extractPromptAfterModelName(userText: string): string {
    const dashMatch = userText.match(/[-:—]\s*(.+)$/);
    if (dashMatch?.[1]?.trim()) return dashMatch[1].trim();
    return userText
        .replace(/\bмодель\b/gi, "")
        .replace(/\bmodel\b/gi, "")
        .replace(/\b(claude|haiku|opus|sonnet|gemini|gpt|codex)\b\s*[\w. -]*/i, "")
        .trim() || userText;
}

function priceLabel(skill: TelegramCandidate): string {
    if (skill.priceLabel) return ` — ${skill.priceLabel}`;
    return skill.priceUSD == null ? "" : ` — $${Number(skill.priceUSD).toFixed(4)}`;
}

async function withTelegramPriceLabels(candidates: Awaited<ReturnType<typeof discoverSkills>>): Promise<TelegramCandidate[]> {
    if (!candidates.length) return [];
    const ids = candidates.map((candidate) => candidate.id);
    const rows = await prisma.provider.findMany({
        where: {
            skillId: { in: ids },
            isActive: true,
            endpoint: { contains: "/api/providers/kie-llm" },
        },
        select: { skillId: true, syncConfig: true },
    });
    const labels = new Map<number, string>();
    for (const row of rows) {
        if (labels.has(row.skillId)) continue;
        let config: { pricing?: Record<string, unknown> } | null = null;
        try {
            config = row.syncConfig ? JSON.parse(row.syncConfig) as { pricing?: Record<string, unknown> } : null;
        } catch {
            config = null;
        }
        const pricing = config?.pricing;
        const input = Number(pricing?.inputUsdPerMillionTokens);
        const output = Number(pricing?.outputUsdPerMillionTokens);
        if (Number.isFinite(input) || Number.isFinite(output)) {
            labels.set(row.skillId, `input $${Number.isFinite(input) ? input : 0}/1M tokens, output $${Number.isFinite(output) ? output : 0}/1M tokens`);
        }
    }
    return candidates.map((candidate) => ({ ...candidate, priceLabel: labels.get(candidate.id) }));
}

function moreSkillsHint(hasMore?: boolean): string | null {
    return hasMore ? "Use /more to show the next 10 skills." : null;
}

function discoverMessage(candidates: TelegramCandidate[], hasMore?: boolean): string {
    if (!candidates.length) return "Не нашел подходящих скилов. Попробуйте описать задачу конкретнее.";
    return [
        "Подходящие скилы:",
        ...candidates.slice(0, TELEGRAM_SKILL_CHOICES_LIMIT).map((skill, index) => {
            return `${index + 1}. ${skill.name}${priceLabel(skill)}`;
        }),
        "",
        moreSkillsHint(hasMore),
        "Use /choose to select one of these skills.",
        "Напишите задачу более конкретно, и я запущу подходящий скил.",
    ].filter(Boolean).join("\n");
}

function planConfidence(plan: TelegramPlan): number {
    const confidence = Number(plan.confidence);
    if (!Number.isFinite(confidence)) return 0;
    return Math.max(0, Math.min(1, confidence));
}

function hasSelectedCandidate(plan: TelegramPlan, candidates: TelegramCandidate[]): boolean {
    return typeof plan.skillId === "number" && candidates.some((skill) => skill.id === plan.skillId);
}

function skillClarificationMessage(candidates: TelegramCandidate[], plan?: TelegramPlan, hasMore?: boolean): string {
    if (!candidates.length) return "Не уверен, какой скил нужно вызвать. Опишите задачу конкретнее.";
    const intro = plan?.reply && plan.reply.trim()
        ? plan.reply.trim()
        : "Не уверен на 70%, какой именно скил вызвать. Выберите один из вариантов:";
    return [
        intro,
        ...candidates.slice(0, TELEGRAM_SKILL_CHOICES_LIMIT).map((skill, index) => {
            return `${index + 1}. ${skill.name}${priceLabel(skill)}`;
        }),
        "",
        moreSkillsHint(hasMore),
        "Use /choose to select one of these skills.",
        "Ответьте номером или названием скила и добавьте параметры, если они нужны.",
    ].filter(Boolean).join("\n");
}

function isPendingRunPayload(value: unknown): value is PendingRunPayload {
    if (!value || typeof value !== "object") return false;
    const payload = value as PendingRunPayload;
    return typeof payload.text === "string" && Boolean(payload.plan) && Array.isArray(payload.candidates);
}

function isTelegramRunDedupPayload(value: unknown): value is TelegramRunDedupPayload {
    if (!value || typeof value !== "object") return false;
    const payload = value as TelegramRunDedupPayload;
    return payload.kind === "telegram_run_dedup"
        && typeof payload.chatId === "string"
        && typeof payload.text === "string"
        && typeof payload.startedAt === "string"
        && (payload.status === "running" || payload.status === "completed");
}

function isFreshPending(updatedAt: Date): boolean {
    return Date.now() - updatedAt.getTime() <= PENDING_SELECTION_TTL_MS;
}

function isFreshRunDedup(updatedAt: Date): boolean {
    return Date.now() - updatedAt.getTime() <= RUNNING_SKILL_DEDUP_TTL_MS;
}

function matchesTelegramRunDedup(
    payload: TelegramRunDedupPayload,
    identity: TelegramRunIdentity,
): boolean {
    if (identity.updateId != null && payload.updateId != null) return identity.updateId === payload.updateId;
    return payload.chatId === String(identity.chatId)
        && payload.messageId === identity.messageId
        && payload.text === identity.text;
}

function jsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
}

async function updateConversation(input: {
    telegramUserId: string;
    chatId: number | string;
    pendingAction?: string | null;
    pendingPayload?: unknown;
    lastIntent?: string | null;
    lastParams?: unknown;
    lastSkillId?: number | null;
    lastProviderHint?: string | null;
    lastRunId?: string | null;
    quietMode?: boolean;
}): Promise<void> {
    await prisma.telegramConversation.upsert({
        where: { telegramUserId: input.telegramUserId },
        create: {
            telegramUserId: input.telegramUserId,
            chatId: String(input.chatId),
            pendingAction: input.pendingAction ?? null,
            pendingPayload: jsonInput(input.pendingPayload),
            lastIntent: input.lastIntent ?? null,
            lastParams: jsonInput(input.lastParams),
            lastSkillId: input.lastSkillId ?? null,
            lastProviderHint: input.lastProviderHint ?? null,
            lastRunId: input.lastRunId ?? null,
            quietMode: input.quietMode ?? false,
        },
        update: {
            chatId: String(input.chatId),
            ...(input.pendingAction !== undefined ? { pendingAction: input.pendingAction } : {}),
            ...(input.pendingPayload !== undefined ? { pendingPayload: jsonInput(input.pendingPayload) } : {}),
            ...(input.lastIntent !== undefined ? { lastIntent: input.lastIntent } : {}),
            ...(input.lastParams !== undefined ? { lastParams: jsonInput(input.lastParams) } : {}),
            ...(input.lastSkillId !== undefined ? { lastSkillId: input.lastSkillId } : {}),
            ...(input.lastProviderHint !== undefined ? { lastProviderHint: input.lastProviderHint } : {}),
            ...(input.lastRunId !== undefined ? { lastRunId: input.lastRunId } : {}),
            ...(input.quietMode !== undefined ? { quietMode: input.quietMode } : {}),
        },
    });
}

async function getConversation(telegramUserId: string) {
    return prisma.telegramConversation.findUnique({ where: { telegramUserId } });
}

type TelegramRunIdentity = {
    updateId?: number;
    messageId?: number;
    chatId: number | string;
    text: string;
};

async function tryMarkTelegramRunInFlight(input: {
    telegramUserId: string;
    identity?: TelegramRunIdentity;
}): Promise<boolean> {
    if (!input.identity?.messageId && input.identity?.updateId == null) return true;

    const conversation = await getConversation(input.telegramUserId);
    if (
        (conversation?.pendingAction === "running_skill" || conversation?.pendingAction === "completed_skill")
        && isTelegramRunDedupPayload(conversation.pendingPayload)
        && isFreshRunDedup(conversation.updatedAt)
        && matchesTelegramRunDedup(conversation.pendingPayload, input.identity)
    ) {
        return false;
    }

    await updateConversation({
        telegramUserId: input.telegramUserId,
        chatId: input.identity.chatId,
        pendingAction: "running_skill",
        pendingPayload: {
            kind: "telegram_run_dedup",
            updateId: input.identity.updateId,
            messageId: input.identity.messageId,
            chatId: String(input.identity.chatId),
            text: input.identity.text,
            startedAt: new Date().toISOString(),
            status: "running",
        } satisfies TelegramRunDedupPayload,
    });
    return true;
}

async function markTelegramRunCompleted(input: {
    telegramUserId: string;
    identity?: TelegramRunIdentity;
}): Promise<void> {
    if (!input.identity?.messageId && input.identity?.updateId == null) return;
    await updateConversation({
        telegramUserId: input.telegramUserId,
        chatId: input.identity.chatId,
        pendingAction: "completed_skill",
        pendingPayload: {
            kind: "telegram_run_dedup",
            updateId: input.identity.updateId,
            messageId: input.identity.messageId,
            chatId: String(input.identity.chatId),
            text: input.identity.text,
            startedAt: new Date().toISOString(),
            status: "completed",
        } satisfies TelegramRunDedupPayload,
    });
}

function chooseSkillFromText(text: string, candidates: TelegramCandidate[]) {
    const trimmed = text.trim();
    const numberMatch = trimmed.match(/^(?:#|skill\s*)?(\d+)$/i)
        ?? trimmed.match(/^(?:выбери|выбираю|вариант|номер|option|choose|pick)\s+(?:#|skill\s*)?(\d+)$/i);
    const asNumber = Number(numberMatch?.[1]);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= candidates.length) {
        return candidates[asNumber - 1];
    }

    const normalized = trimmed.toLowerCase();
    if (normalized.length < 4) return undefined;
    return candidates.find((skill) => {
        const skillName = skill.name.toLowerCase();
        return normalized === skillName
            || normalized === `run ${skillName}`
            || normalized === `запусти ${skillName}`
            || skillName.includes(normalized);
    });
}

async function runTelegramSkill(input: {
    req: NextRequest;
    telegramUserId: string;
    chatId: number | string;
    replyToMessageId?: number;
    text: string;
    plan: TelegramPlan;
    attachmentParams?: Record<string, unknown>;
    identity?: TelegramRunIdentity;
}): Promise<void> {
    const linkedAccount = await findLinkedTelegramAccount(input.telegramUserId);
    let reservedUsageId: string | null = null;
    let reservedSkillId: number | null = null;

    try {
        const shouldRun = await tryMarkTelegramRunInFlight({
            telegramUserId: input.telegramUserId,
            identity: input.identity,
        });
        if (!shouldRun) return;

        await sendTelegramChatAction(input.chatId, "upload_document");

        let params = input.plan.params && typeof input.plan.params === "object" ? input.plan.params : {};
        params = { ...params, ...(input.attachmentParams ?? {}) };
        params = applyRequestedResultLimit(params, input.text);
        if (typeof input.plan.skillId === "number" && await shouldInjectLlmPrompt(input.plan.skillId, params)) {
            params = { ...params, prompt: extractPromptAfterModelName(input.text) };
        }
        const sessionId = linkedAccount
            ? `telegram-linked-${linkedAccount.newApiUserId}-${new Date().toISOString().slice(0, 10)}`
            : `telegram-${input.telegramUserId}-${new Date().toISOString().slice(0, 10)}`;

        if (!linkedAccount) {
            const reservation = await reserveAnonymousTrialRun({
                anonymousClientId: input.telegramUserId,
                source: "telegram",
                externalUserId: input.telegramUserId,
                ipHash: getTrialIpHash(input.req),
                skillId: typeof input.plan.skillId === "number" ? input.plan.skillId : null,
                enforceIpLimit: false,
            });
            if (!reservation.allowed) {
                await sendTelegramMessage({
                    chatId: input.chatId,
                    text: telegramLimitMessage(),
                    replyToMessageId: input.replyToMessageId,
                });
                return;
            }
            reservedUsageId = reservation.usageId;
            reservedSkillId = typeof input.plan.skillId === "number" ? input.plan.skillId : null;
        }

        const result = await runSkill({
            source: "rest",
            newApiUserId: linkedAccount?.newApiUserId ?? TRIAL_NEWAPI_USER_ID,
            authHeader: "",
            internalBaseUrl: input.req.nextUrl.origin,
            intent: input.plan.intent || input.text,
            params,
            skillId: typeof input.plan.skillId === "number" ? input.plan.skillId : undefined,
            providerHint: input.plan.providerHint || undefined,
            waitForResult: false,
            sessionId,
            billingMode: linkedAccount ? "paid" : "trial",
            trialOnly: false,
        });

        await updateConversation({
            telegramUserId: input.telegramUserId,
            chatId: input.chatId,
            pendingAction: input.identity ? "completed_skill" : null,
            pendingPayload: input.identity
                ? {
                    kind: "telegram_run_dedup",
                    updateId: input.identity.updateId,
                    messageId: input.identity.messageId,
                    chatId: String(input.identity.chatId),
                    text: input.identity.text,
                    startedAt: new Date().toISOString(),
                    status: "completed",
                } satisfies TelegramRunDedupPayload
                : null,
            lastIntent: input.plan.intent || input.text,
            lastParams: params,
            lastSkillId: result.skillId || input.plan.skillId || null,
            lastProviderHint: input.plan.providerHint || null,
            lastRunId: result.runId,
        });

        if (reservedUsageId) {
            await completeAnonymousTrialRun({
                usageId: reservedUsageId,
                status: result.status,
                skillId: result.skillId || input.plan.skillId || null,
                runId: result.runId,
            });
        }

        if (result.status === "running" || result.status === "waiting") {
            await registerTelegramDelivery({
                runId: result.runId,
                telegramUserId: input.telegramUserId,
                chatId: input.chatId,
                replyToMessageId: input.replyToMessageId,
            });
            await sendTelegramMessage({
                chatId: input.chatId,
                text: resultText(result),
                replyToMessageId: input.replyToMessageId,
            });
            return;
        }

        await sendTelegramRunResult({
            chatId: input.chatId,
            result,
            replyToMessageId: input.replyToMessageId,
            quietMode: (await getConversation(input.telegramUserId))?.quietMode ?? false,
        });
    } catch (error) {
        if (reservedUsageId) {
            await completeAnonymousTrialRun({
                usageId: reservedUsageId,
                status: "error",
                skillId: reservedSkillId,
            }).catch(() => {});
        }
        await markTelegramRunCompleted({
            telegramUserId: input.telegramUserId,
            identity: input.identity,
        }).catch(() => {});
        throw error;
    }
}

async function shouldInjectLlmPrompt(skillId: number, params: Record<string, unknown>): Promise<boolean> {
    if (typeof params.prompt === "string" && params.prompt.trim()) return false;
    if (typeof params.input === "string" && params.input.trim()) return false;
    if (typeof params.query === "string" && params.query.trim()) return false;
    if (Array.isArray(params.messages) && params.messages.length > 0) return false;

    const provider = await prisma.provider.findFirst({
        where: {
            skillId,
            isActive: true,
            endpoint: { contains: "/api/providers/kie-llm" },
        },
        select: { id: true },
    });
    return Boolean(provider);
}

async function handlePendingSelection(input: {
    req: NextRequest;
    telegramUserId: string;
    chatId: number | string;
    replyToMessageId?: number;
    text: string;
    attachmentParams?: Record<string, unknown>;
    identity?: TelegramRunIdentity;
}): Promise<boolean> {
    const conversation = await getConversation(input.telegramUserId);
    if (
        conversation?.pendingAction !== "choose_skill"
        || !isPendingRunPayload(conversation.pendingPayload)
        || !isFreshPending(conversation.updatedAt)
    ) {
        return false;
    }

    const pendingPayload = conversation.pendingPayload as PendingRunPayload;
    const selected = chooseSkillFromText(input.text, pendingPayload.candidates);
    if (!selected) {
        await updateConversation({
            telegramUserId: input.telegramUserId,
            chatId: input.chatId,
            pendingAction: null,
            pendingPayload: null,
        });
        return false;
    }

    const plan = {
        ...pendingPayload.plan,
        action: "run_skill" as const,
        skillId: selected.id,
        confidence: 1,
    };
    await runTelegramSkill({
        req: input.req,
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
        replyToMessageId: input.replyToMessageId,
        text: pendingPayload.text,
        plan,
        attachmentParams: input.attachmentParams ?? pendingPayload.attachmentParams,
        identity: input.identity,
    });
    return true;
}

async function promptCurrentSkillSelection(input: {
    telegramUserId: string;
    chatId: number | string;
    replyToMessageId?: number;
}): Promise<void> {
    const conversation = await getConversation(input.telegramUserId);
    if (isPendingRunPayload(conversation?.pendingPayload) && isFreshPending(conversation.updatedAt)) {
        await updateConversation({
            telegramUserId: input.telegramUserId,
            chatId: input.chatId,
            pendingAction: "choose_skill",
            pendingPayload: conversation.pendingPayload,
        });
        await sendTelegramMessage({
            chatId: input.chatId,
            text: skillClarificationMessage(
                conversation.pendingPayload.candidates,
                conversation.pendingPayload.plan,
                Boolean(conversation.pendingPayload.hasMore),
            ),
            replyToMessageId: input.replyToMessageId,
        });
        return;
    }

    await sendTelegramMessage({
        chatId: input.chatId,
        text: "No active skill list. Send a task first, then use /choose.",
        replyToMessageId: input.replyToMessageId,
    });
}

async function showNextSkillPage(input: {
    telegramUserId: string;
    chatId: number | string;
    replyToMessageId?: number;
}): Promise<void> {
    const conversation = await getConversation(input.telegramUserId);
    if (!isPendingRunPayload(conversation?.pendingPayload) || !isFreshPending(conversation.updatedAt)) {
        await sendTelegramMessage({
            chatId: input.chatId,
            text: "No skill list is active. Send a new task to discover skills.",
            replyToMessageId: input.replyToMessageId,
        });
        return;
    }

    const currentPayload = conversation.pendingPayload as PendingRunPayload;
    const page = (currentPayload.page ?? 0) + 1;
    const candidates = await telegramDiscoveryPage(currentPayload.text, page);
    if (!candidates.length) {
        await sendTelegramMessage({
            chatId: input.chatId,
            text: "No more matching skills.",
            replyToMessageId: input.replyToMessageId,
        });
        return;
    }

    const pendingPayload = {
        ...currentPayload,
        candidates,
        page,
        hasMore: await telegramDiscoveryHasMore(currentPayload.text, page),
    };
    await updateConversation({
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
        pendingAction: "choose_skill",
        pendingPayload,
    });
    await sendTelegramMessage({
        chatId: input.chatId,
        text: skillClarificationMessage(candidates, pendingPayload.plan, Boolean(pendingPayload.hasMore)),
        replyToMessageId: input.replyToMessageId,
    });
}

export async function POST(req: NextRequest) {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const actualSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (expectedSecret && actualSecret !== expectedSecret) {
        return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await req.json() as TelegramUpdate;
    const callback = update.callback_query;
    if (callback) {
        const chatId = callback.message?.chat?.id;
        const data = callback.data;
        if (!chatId || !data) {
            await answerTelegramCallback(callback.id).catch(() => {});
            return NextResponse.json({ ok: true });
        }
        const telegramUserId = telegramUserIdForCallback(callback);
        await answerTelegramCallback(callback.id).catch(() => {});

        try {
            if (data === "choose_skill") {
                await promptCurrentSkillSelection({
                    telegramUserId,
                    chatId,
                    replyToMessageId: callback.message?.message_id,
                });
                return NextResponse.json({ ok: true });
            }

            if (data === "more_skills") {
                await showNextSkillPage({
                    telegramUserId,
                    chatId,
                    replyToMessageId: callback.message?.message_id,
                });
                return NextResponse.json({ ok: true });
            }

            if (data === "retry_last") {
                const conversation = await getConversation(telegramUserId);
                if (!conversation?.lastIntent) {
                    await sendTelegramMessage({
                        chatId,
                        text: "Пока нет последнего запуска для повтора. Отправьте новую задачу.",
                        replyToMessageId: callback.message?.message_id,
                    });
                    return NextResponse.json({ ok: true });
                }
                await runTelegramSkill({
                    req,
                    telegramUserId,
                    chatId,
                    replyToMessageId: callback.message?.message_id,
                    text: conversation.lastIntent,
                    plan: {
                        action: "run_skill",
                        intent: conversation.lastIntent,
                        skillId: conversation.lastSkillId,
                        providerHint: conversation.lastProviderHint,
                        params: conversation.lastParams && typeof conversation.lastParams === "object"
                            ? conversation.lastParams as Record<string, unknown>
                            : {},
                        confidence: 1,
                    },
                });
                return NextResponse.json({ ok: true });
            }

            return NextResponse.json({ ok: true });
        } catch (error) {
            console.error("[telegram/webhook] callback error:", error);
            await sendTelegramMessage({
                chatId,
                text: `Ошибка: ${String(error)}`,
                replyToMessageId: callback.message?.message_id,
            }).catch(() => {});
            return NextResponse.json({ ok: true });
        }
    }

    const message = update.message;
    const chatId = message?.chat?.id;
    const text = message ? telegramMessageText(message) : "";
    const hasAttachments = message ? hasTelegramAttachments(message) : false;
    if (!chatId || !message) return NextResponse.json({ ok: true });
    const telegramUserId = telegramUserIdFor(message);

    if (!text && hasAttachments) {
        await sendTelegramMessage({
            chatId,
            text: "Please add an instruction or caption with the file, for example: convert this PNG to PDF.",
            replyToMessageId: message.message_id,
        });
        return NextResponse.json({ ok: true });
    }
    if (!text) return NextResponse.json({ ok: true });

    if (text === "/start" || text === "/help") {
        await sendTelegramMessage({
            chatId,
            text: helpMessage(),
            replyToMessageId: message.message_id,
        });
        return NextResponse.json({ ok: true });
    }
    if (text === "/choose") {
        await promptCurrentSkillSelection({
            telegramUserId,
            chatId,
            replyToMessageId: message.message_id,
        });
        return NextResponse.json({ ok: true });
    }
    if (text === "/more") {
        await showNextSkillPage({
            telegramUserId,
            chatId,
            replyToMessageId: message.message_id,
        });
        return NextResponse.json({ ok: true });
    }
    if (text === "/dashboard") {
        await sendTelegramMessage({
            chatId,
            text: `${APP_URL}/dashboard`,
            replyToMessageId: message.message_id,
        });
        return NextResponse.json({ ok: true });
    }
    if (text.toLowerCase().startsWith("/link")) {
        const code = text.split(/\s+/)[1];
        if (!code) {
            await sendTelegramMessage({
                chatId,
                text: "Отправьте код так: /link ABC123. Код создается в Aporto Settings.",
                replyToMessageId: message.message_id,
            });
            return NextResponse.json({ ok: true });
        }
        const linked = await linkTelegramAccount(code, message);
        await sendTelegramMessage({
            chatId,
            text: linked.success
                ? `Telegram подключен к Aporto${linked.linkedEmail ? ` (${linked.linkedEmail})` : ""}. Теперь запуски идут с вашего аккаунта.`
                : linked.message,
            replyToMessageId: message.message_id,
        });
        return NextResponse.json({ ok: true });
    }
    if (text === "/unlink") {
        await prisma.telegramAccount.deleteMany({ where: { telegramUserId } });
        await sendTelegramMessage({
            chatId,
            text: "Telegram отвязан от Aporto. Следующие запуски пойдут через trial.",
            replyToMessageId: message.message_id,
        });
        return NextResponse.json({ ok: true });
    }
    if (text.toLowerCase().startsWith("/quiet") || text.toLowerCase().startsWith("/silent") || text.toLowerCase() === "/verbose") {
        const normalized = text.toLowerCase();
        const quietMode = normalized === "/verbose"
            ? false
            : /\b(on|yes|true|1|вкл|включить)\b/i.test(text)
                ? true
                : /\b(off|no|false|0|выкл|выключить)\b/i.test(text)
                    ? false
                    : !(await getConversation(telegramUserId))?.quietMode;
        await updateConversation({
            telegramUserId,
            chatId,
            quietMode,
        });
        await sendTelegramMessage({
            chatId,
            text: quietMode
                ? "Quiet mode включен. После результата буду присылать только сам ответ или файлы."
                : "Quiet mode выключен. Буду показывать служебные сообщения и costUSD.",
            replyToMessageId: message.message_id,
        });
        return NextResponse.json({ ok: true });
    }

    try {
        let attachmentParams: Record<string, unknown> | undefined;
        if (hasAttachments) {
            await sendTelegramChatAction(chatId, "upload_document").catch(() => {});
            const attachments = await uploadTelegramAttachments(message);
            attachmentParams = telegramAttachmentParams(attachments);
        }

        const identity: TelegramRunIdentity = {
            updateId: update.update_id,
            messageId: message.message_id,
            chatId,
            text,
        };

        if (await handlePendingSelection({ req, telegramUserId, chatId, replyToMessageId: message.message_id, text, attachmentParams, identity })) {
            return NextResponse.json({ ok: true });
        }

        await sendTelegramChatAction(chatId);
        const { plan, candidates, hasMore } = await planTelegramRequest(text);

        if (plan.action === "help") {
            await sendTelegramMessage({
                chatId,
                text: helpMessage(),
                replyToMessageId: message.message_id,
            });
            return NextResponse.json({ ok: true });
        }
        if (plan.action === "ask_clarification") {
            if (planConfidence(plan) >= MIN_RUN_CONFIDENCE && hasSelectedCandidate(plan, candidates)) {
                await runTelegramSkill({ req, telegramUserId, chatId, replyToMessageId: message.message_id, text, plan, attachmentParams, identity });
                return NextResponse.json({ ok: true });
            }

            await updateConversation({
                telegramUserId,
                chatId,
                pendingAction: "choose_skill",
                pendingPayload: { text, plan, candidates, attachmentParams, page: 0, hasMore },
            });
            await sendTelegramMessage({
                chatId,
                text: skillClarificationMessage(candidates, plan, hasMore),
                replyToMessageId: message.message_id,
            });
            return NextResponse.json({ ok: true });
        }
        if (plan.action === "discover" || plan.action !== "run_skill") {
            await updateConversation({
                telegramUserId,
                chatId,
                pendingAction: "choose_skill",
                pendingPayload: { text, plan, candidates, attachmentParams, page: 0, hasMore },
            });
            await sendTelegramMessage({
                chatId,
                text: discoverMessage(candidates, hasMore),
                replyToMessageId: message.message_id,
            });
            return NextResponse.json({ ok: true });
        }
        if (planConfidence(plan) < MIN_RUN_CONFIDENCE || !hasSelectedCandidate(plan, candidates)) {
            await updateConversation({
                telegramUserId,
                chatId,
                pendingAction: "choose_skill",
                pendingPayload: { text, plan, candidates, attachmentParams, page: 0, hasMore },
            });
            await sendTelegramMessage({
                chatId,
                text: skillClarificationMessage(candidates, plan, hasMore),
                replyToMessageId: message.message_id,
            });
            return NextResponse.json({ ok: true });
        }

        await runTelegramSkill({ req, telegramUserId, chatId, replyToMessageId: message.message_id, text, plan, attachmentParams, identity });
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[telegram/webhook] error:", error);
        await sendTelegramMessage({
            chatId,
            text: `Ошибка: ${String(error)}`,
            replyToMessageId: message.message_id,
        }).catch(() => {});
        return NextResponse.json({ ok: true });
    }
}
