import { createHash } from "crypto";
import { logServiceUsage } from "@/lib/serviceProxy";
import { deductSkillUsage, refundSkillUsage, type SkillCharge } from "@/lib/promoGrants";
import { prisma } from "@/lib/prisma";
import { storeSkillResultArtifacts, type StoredArtifact } from "@/lib/artifacts";
import {
    createSkillRevenue,
    deactivateSkillIfNoActiveProviders,
    disableProviderIfOthersActive,
    discoverSkills,
    executeSkillViaProvider,
    findExactSkillByIntentWithFilters,
    MAX_PROVIDER_ATTEMPTS,
    recordSkillCall,
    updateSkillCallCost,
    selectProvider,
    updateProviderStats,
    normalizeSkillText,
    type ScoredProvider,
    type DiscoveredSkill,
} from "@/lib/routing";

const KIE_CREDIT_TO_USD = 0.005;
function waitSecondsFromEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const MAX_WAIT_SECONDS = waitSecondsFromEnv("APORTO_MAX_WAIT_SECONDS", 600);
export const DEFAULT_WAIT_SECONDS = Math.min(
    waitSecondsFromEnv("APORTO_DEFAULT_WAIT_SECONDS", 600),
    MAX_WAIT_SECONDS,
);

type SkillRunSource = "mcp" | "rest";

type RunStatus = "succeeded" | "running" | "waiting" | "failed" | "needs_selection";

type RunSkillInput = {
    source: SkillRunSource;
    newApiUserId: number;
    authHeader: string;
    internalBaseUrl?: string;
    intent: string;
    params?: Record<string, unknown>;
    skillId?: number;
    providerHint?: string;
    waitForResult?: boolean;
    maxWaitSeconds?: number;
    sessionId?: string;
    billingMode?: "paid" | "trial";
    trialOnly?: boolean;
};

type RunSkillResult = {
    status: RunStatus;
    runId: string;
    skillId: number;
    skillName?: string;
    providerId?: number;
    provider?: string;
    providerTaskId?: string;
    nextPollAt?: string;
    costUSD?: number;
    data?: unknown;
    artifact?: StoredArtifact;
    artifacts?: StoredArtifact[];
    choices?: Array<{
        skillId: number;
        name: string;
        description: string;
        category: string | null;
        paramsSchema: unknown;
        similarity: number;
    }>;
    error?: {
        code: string;
        message: string;
        cause?: string;
        retryable: boolean;
    };
};

function parseParamsSchema(value: string | null): unknown {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function selectionChoices(matches: DiscoveredSkill[]) {
    return matches.slice(0, 5).map((match) => ({
        skillId: match.id,
        name: match.name,
        description: match.description,
        category: match.category,
        paramsSchema: parseParamsSchema(match.paramsSchema),
        similarity: Math.round(match.similarity * 100) / 100,
    }));
}

function hasCloseSkillVariants(intent: string, matches: DiscoveredSkill[]): boolean {
    if (matches.length < 2) return false;

    const [first, second] = matches;
    if (!first || !second) return false;
    if (first.category !== second.category) return false;
    if (Math.abs(first.similarity - second.similarity) > 0.03) return false;

    const normalizedIntent = normalizeSkillText(intent);
    const variantTokens = ["1k", "2k", "4k", "720p", "1080p", "fast", "stable", "pro", "10s", "15s"];
    const mentionsVariant = variantTokens.some((token) => normalizedIntent.includes(token));
    const closeNames = matches
        .slice(0, 5)
        .filter((match) => match.category === first.category)
        .map((match) => normalizeSkillText(match.name));
    const hasResolutionFamily = closeNames.filter((name) => name.includes("nanobanana") || name.includes("sora") || name.includes("veo")).length > 1;

    return mentionsVariant || hasResolutionFamily;
}

type PollDueSkillRunsResult = {
    checked: number;
    succeeded: number;
    failed: number;
    running: number;
    errors: Array<{ runId: string; error: string }>;
    runs: RunSkillResult[];
};

type SkillRunRow = {
    id: string;
    newApiUserId: number;
    sessionId: string;
    skillId: number;
    providerId: number | null;
    skillCallId: number | null;
    status: string;
    lifecycleMode: string;
    providerTaskId: string | null;
    result: unknown;
    error: unknown;
    artifactJson: unknown;
    costUSD: number | null;
    promoRedemptionId: string | null;
    promoCoveredUSD: number | null;
    balanceChargedUSD: number | null;
};

type ProviderLookupRow = {
    id: number;
    name: string;
    endpoint: string;
    price_per_call: number;
    cost_per_char: number | null;
    avg_latency_ms: number;
    retry_rate: number;
    timeout_rate: number;
    secret: string | null;
    sync_config: string | null;
};

type AsyncProviderPollResult = {
    success: boolean;
    data: unknown;
    latencyMs: number;
    errorType: "success" | "timeout" | "network_error" | "error_5xx" | "error_4xx";
};

type NormalizedProviderTask = {
    status: RunStatus;
    data?: unknown;
    error?: RunSkillResult["error"];
};

type AsyncProviderAdapter = {
    name: string;
    matches(provider: ScoredProvider, initialData?: unknown): boolean;
    poll(provider: ScoredProvider, providerTaskId: string, internalBaseUrl?: string): Promise<AsyncProviderPollResult>;
    normalize(data: unknown): NormalizedProviderTask;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeSkillParamsHash(skillId: number, params: Record<string, unknown>): string {
    const canonical = JSON.stringify(params, (_, value: unknown) => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        );
    });
    return createHash("sha256").update(`${skillId}:${canonical}`).digest("hex");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonMaybe(value: unknown): unknown {
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function isEmptyResultValue(value: unknown): boolean {
    const parsed = parseJsonMaybe(value);
    if (parsed == null) return true;
    if (typeof parsed === "string") {
        const trimmed = parsed.trim().toLowerCase();
        return trimmed === "" || trimmed === "null" || trimmed === "{}" || trimmed === "[]";
    }
    if (Array.isArray(parsed)) return parsed.length === 0;
    if (isPlainObject(parsed)) return Object.keys(parsed).length === 0;
    return false;
}

function hasUsefulResultPayload(value: unknown): boolean {
    const parsed = parseJsonMaybe(value);
    if (isEmptyResultValue(parsed)) return false;

    if (typeof parsed === "string") {
        return /^https?:\/\//i.test(parsed) || parsed.trim().length > 0;
    }

    if (Array.isArray(parsed)) {
        return parsed.some((item) => hasUsefulResultPayload(item));
    }

    if (!isPlainObject(parsed)) return true;

    const directKeys = [
        "url", "urls", "output", "outputs", "result", "results", "response",
        "audioUrl", "audio_url", "videoUrl", "video_url", "imageUrl", "image_url",
        "stored_artifacts",
    ];
    for (const key of directKeys) {
        if (key in parsed && !isEmptyResultValue(parsed[key]) && hasUsefulResultPayload(parsed[key])) {
            return true;
        }
    }

    return Object.entries(parsed).some(([key, child]) => {
        if (["raw", "providerTask", "taskId", "task_id", "recordId", "jobId", "job_id"].includes(key)) {
            return false;
        }
        if (/(url|output|result|response|artifact)/i.test(key)) {
            return hasUsefulResultPayload(child);
        }
        return false;
    });
}

function findStringKey(value: unknown, keys: string[]): string | null {
    if (!value || typeof value !== "object") return null;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findStringKey(item, keys);
            if (found) return found;
        }
        return null;
    }

    const object = value as Record<string, unknown>;
    for (const key of keys) {
        const direct = object[key];
        if (typeof direct === "string" && direct.trim()) return direct;
    }
    for (const child of Object.values(object)) {
        const found = findStringKey(child, keys);
        if (found) return found;
    }
    return null;
}

function findNumberKey(value: unknown, keys: string[]): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (!value || typeof value !== "object") return null;

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findNumberKey(item, keys);
            if (found != null) return found;
        }
        return null;
    }

    const object = value as Record<string, unknown>;
    for (const key of keys) {
        const direct = object[key];
        if (typeof direct === "number" && Number.isFinite(direct)) return direct;
        if (typeof direct === "string" && direct.trim() && Number.isFinite(Number(direct))) {
            return Number(direct);
        }
    }

    for (const child of Object.values(object)) {
        const found = findNumberKey(child, keys);
        if (found != null) return found;
    }
    return null;
}

function findObjectWithNumberKey(value: unknown, keys: string[]): Record<string, unknown> | null {
    if (!value || typeof value !== "object") return null;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findObjectWithNumberKey(item, keys);
            if (found) return found;
        }
        return null;
    }

    const object = value as Record<string, unknown>;
    if (keys.some((key) => typeof object[key] === "number" || (typeof object[key] === "string" && Number.isFinite(Number(object[key]))))) {
        return object;
    }
    for (const child of Object.values(object)) {
        const found = findObjectWithNumberKey(child, keys);
        if (found) return found;
    }
    return null;
}

function numberFromObject(object: Record<string, unknown>, keys: string[]): number {
    for (const key of keys) {
        const value = object[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
    }
    return 0;
}

function numberFromConfig(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return null;
}

function resolveKieLlmUsageCostUSD(provider: ScoredProvider, result: unknown): number | null {
    const pricing = provider.syncConfig?.pricing;
    if (!isPlainObject(pricing)) return null;

    const inputUsdPerMillion = numberFromConfig(pricing.inputUsdPerMillionTokens);
    const outputUsdPerMillion = numberFromConfig(pricing.outputUsdPerMillionTokens);
    const cachedInputUsdPerMillion = numberFromConfig(pricing.cachedInputUsdPerMillionTokens);
    if (inputUsdPerMillion == null && outputUsdPerMillion == null) return null;

    const usage = findObjectWithNumberKey(result, ["prompt_tokens", "input_tokens", "completion_tokens", "output_tokens", "total_tokens"]);
    if (!usage) return null;

    const inputTokens = numberFromObject(usage, ["input_tokens", "prompt_tokens"]);
    const outputTokens = numberFromObject(usage, ["output_tokens", "completion_tokens"]);
    const cachedInputTokens = numberFromObject(usage, ["cache_read_input_tokens", "cached_input_tokens"]);
    const billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);

    const inputCost = inputUsdPerMillion == null ? 0 : (billableInputTokens * inputUsdPerMillion) / 1_000_000;
    const cachedInputCost = cachedInputUsdPerMillion == null ? 0 : (cachedInputTokens * cachedInputUsdPerMillion) / 1_000_000;
    const outputCost = outputUsdPerMillion == null ? 0 : (outputTokens * outputUsdPerMillion) / 1_000_000;
    const total = inputCost + cachedInputCost + outputCost;

    return total > 0 ? Math.max(0.0001, total) : null;
}

function findObjectKey(value: unknown, keys: string[]): Record<string, unknown> | null {
    if (!value || typeof value !== "object") return null;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findObjectKey(item, keys);
            if (found) return found;
        }
        return null;
    }

    const object = value as Record<string, unknown>;
    for (const key of keys) {
        if (isPlainObject(object[key])) return object[key] as Record<string, unknown>;
    }
    for (const child of Object.values(object)) {
        const found = findObjectKey(child, keys);
        if (found) return found;
    }
    return null;
}

function eventPriceFromConfig(provider: ScoredProvider, eventName: string): number | null {
    const pricing = provider.syncConfig?.pricing;
    if (!isPlainObject(pricing)) return null;

    const snapshot = isPlainObject(pricing.pricingSnapshot) ? pricing.pricingSnapshot : null;
    const pricingPerEvent = snapshot && isPlainObject(snapshot.pricingPerEvent) ? snapshot.pricingPerEvent : null;
    const actorChargeEvents = pricingPerEvent && isPlainObject(pricingPerEvent.actorChargeEvents)
        ? pricingPerEvent.actorChargeEvents
        : null;
    const eventConfig = actorChargeEvents && isPlainObject(actorChargeEvents[eventName])
        ? actorChargeEvents[eventName] as Record<string, unknown>
        : null;
    const eventPrice = eventConfig ? numberFromConfig(eventConfig.eventPriceUsd) : null;
    if (eventPrice != null) return eventPrice;

    const primaryEventName = typeof pricing.primaryEventName === "string" ? pricing.primaryEventName : null;
    if (primaryEventName === eventName) return numberFromConfig(pricing.primaryEventPriceUsd);
    return null;
}

function resolveApifyUsageCostUSD(provider: ScoredProvider, result: unknown): number | null {
    const usageTotalUsd = findNumberKey(result, [
        "usageTotalUsd",
        "usage_total_usd",
        "totalUsageUsd",
        "total_usage_usd",
    ]);
    if (usageTotalUsd != null && usageTotalUsd > 0) return Math.max(0.0001, usageTotalUsd);

    const chargedEventCounts = findObjectKey(result, ["chargedEventCounts", "charged_event_counts"]);
    if (!chargedEventCounts) return null;

    let total = 0;
    for (const [eventName, rawCount] of Object.entries(chargedEventCounts)) {
        const count = numberFromConfig(rawCount);
        const price = eventPriceFromConfig(provider, eventName);
        if (count != null && count > 0 && price != null && price > 0) {
            total += count * price;
        }
    }

    return total > 0 ? Math.max(0.0001, total) : null;
}

function resolveActualCostUSD(provider: ScoredProvider, result: unknown, estimatedCostUSD: number): number {
    if (isApifyProvider(provider)) {
        const apifyUsageCost = resolveApifyUsageCostUSD(provider, result);
        if (apifyUsageCost != null) return apifyUsageCost;
    }

    if (!isKieProvider(provider)) return estimatedCostUSD;

    const creditsConsumed = findNumberKey(result, ["creditsConsumed", "credits_consumed", "creditConsumed", "credit_consumed"]);
    if (creditsConsumed != null && creditsConsumed > 0) {
        return Math.max(0.0001, creditsConsumed * KIE_CREDIT_TO_USD);
    }

    const llmUsageCost = resolveKieLlmUsageCostUSD(provider, result);
    if (llmUsageCost != null) return llmUsageCost;

    return estimatedCostUSD;
}

function isKieProvider(provider: ScoredProvider): boolean {
    return /\/api\/providers\/kie$/.test(provider.endpoint) || provider.name.startsWith("KIE - ");
}

function isApifyProvider(provider: ScoredProvider): boolean {
    return /\/api\/providers\/apify(?:$|\?)/.test(provider.endpoint)
        || provider.name.toLowerCase().includes("apify")
        || typeof provider.syncConfig?.actorId === "string";
}

function normalizeKieRecordInfo(data: unknown): NormalizedProviderTask {
    const payload = isPlainObject(data) && isPlainObject(data.data) ? data.data : data;
    if (!isPlainObject(payload)) return { status: "running" };

    if (typeof payload.successFlag === "number") {
        if (payload.successFlag === 1) {
            const response = parseJsonMaybe(payload.response);
            // Use a basic non-empty check instead of hasUsefulResultPayload, which only
            // recognises media/URL shapes and would incorrectly treat LLM text responses
            // (Claude/OpenAI format) as "still running", causing an infinite poll loop.
            if (response == null || isEmptyResultValue(response)) return { status: "running" };
            return {
                status: "succeeded",
                data: {
                    ...(isPlainObject(response) ? response : { response }),
                    providerTask: payload,
                },
            };
        }
        if (payload.successFlag === 2 || payload.successFlag === 3) {
            return {
                status: "failed",
                error: {
                    code: String(payload.errorCode ?? "PROVIDER_TASK_FAILED"),
                    message: String(payload.errorMessage ?? "Provider task failed"),
                    retryable: false,
                },
            };
        }
        return { status: "running" };
    }

    const state = String(payload.state ?? payload.status ?? "").toLowerCase();
    if (["fail", "failed", "error"].includes(state)) {
        return {
            status: "failed",
            error: {
                code: String(payload.failCode ?? "PROVIDER_TASK_FAILED"),
                message: String(payload.failMsg ?? "Provider task failed"),
                retryable: false,
            },
        };
    }

    if (["success", "succeeded", "completed", "complete"].includes(state)) {
        const parsedResult = parseJsonMaybe(payload.resultJson ?? payload.result ?? payload.response);
        if (parsedResult == null || isEmptyResultValue(parsedResult)) return { status: "running" };
        const result = isPlainObject(parsedResult)
            ? parsedResult
            : { result: parsedResult ?? payload };
        return {
            status: "succeeded",
            data: {
                ...result,
                providerTask: payload,
            },
        };
    }

    return { status: "running" };
}

function normalizeApifyRunResult(data: unknown): NormalizedProviderTask {
    if (!isPlainObject(data)) return { status: "running" };

    if (data.success === false) {
        const detail = isPlainObject(data.detail) ? data.detail : null;
        const detailData = detail && isPlainObject(detail.data) ? detail.data : null;
        const status = String(data.status ?? detailData?.status ?? "").toUpperCase();
        if (["FAILED", "TIMED-OUT", "ABORTED"].includes(status)) {
            return {
                status: "failed",
                error: {
                    code: `APIFY_${status.replace("-", "_")}`,
                    message: String(data.message ?? `Apify actor run ${status}.`),
                    cause: JSON.stringify(data),
                    retryable: status !== "ABORTED",
                },
            };
        }
        return {
            status: "failed",
            error: {
                code: String(data.status ?? "APIFY_RUN_FAILED"),
                message: String(data.message ?? "Apify actor run failed."),
                cause: JSON.stringify(data),
                retryable: false,
            },
        };
    }

    const status = String(data.status ?? "").toUpperCase();
    if (["FAILED", "TIMED-OUT", "ABORTED"].includes(status)) {
        return {
            status: "failed",
            error: {
                code: `APIFY_${status.replace("-", "_")}`,
                message: `Apify actor run ${status}.`,
                cause: JSON.stringify(data),
                retryable: status !== "ABORTED",
            },
        };
    }

    if (status !== "SUCCEEDED") return { status: "running" };
    if (!Array.isArray(data.items)) return { status: "running" };

    return {
        status: "succeeded",
        data,
    };
}

function extractProviderTaskId(data: unknown): string | null {
    return findStringKey(data, ["taskId", "task_id", "recordId", "runId", "run_id", "jobId", "job_id"]);
}

function lifecycleModeFor(provider: ScoredProvider, data: unknown): "sync" | "async_poll" {
    if (getAsyncProviderAdapter(provider, data)) return "async_poll";
    return "sync";
}

function providerFromRow(row: ProviderLookupRow): ScoredProvider {
    return {
        id: row.id,
        name: row.name,
        endpoint: row.endpoint,
        pricePerCall: Number(row.price_per_call),
        costPerChar: row.cost_per_char == null ? null : Number(row.cost_per_char),
        avgLatencyMs: Number(row.avg_latency_ms),
        retryRate: Number(row.retry_rate),
        timeoutRate: Number(row.timeout_rate),
        secret: row.secret,
        syncConfig: row.sync_config ? JSON.parse(row.sync_config) : null,
    };
}

async function createRun(input: {
    newApiUserId: number;
    sessionId: string;
    skillId: number;
    providerId?: number;
    status: RunStatus;
    lifecycleMode: string;
    paramsHash?: string;
    providerTaskId?: string | null;
    providerRaw?: unknown;
    result?: unknown;
    error?: unknown;
    costUSD?: number;
    promoRedemptionId?: string | null;
    promoCoveredUSD?: number;
    balanceChargedUSD?: number | null;
    nextPollAt?: Date | null;
    expiresAt?: Date | null;
}): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "SkillRun" (
            "newApiUserId", "sessionId", "skillId", "providerId", status,
            "lifecycleMode", "paramsHash", "providerTaskId", "providerRaw",
            result, error, "costUSD", "promoRedemptionId", "promoCoveredUSD", "balanceChargedUSD", "nextPollAt", "expiresAt", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, NOW(), NOW())
        RETURNING id`,
        input.newApiUserId,
        input.sessionId,
        input.skillId,
        input.providerId ?? null,
        input.status,
        input.lifecycleMode,
        input.paramsHash ?? null,
        input.providerTaskId ?? null,
        input.providerRaw === undefined ? null : JSON.stringify(input.providerRaw),
        input.result === undefined ? null : JSON.stringify(input.result),
        input.error === undefined ? null : JSON.stringify(input.error),
        input.costUSD ?? null,
        input.promoRedemptionId ?? null,
        input.promoCoveredUSD ?? 0,
        input.balanceChargedUSD ?? null,
        input.nextPollAt ?? null,
        input.expiresAt ?? null,
    );
    return rows[0].id;
}

async function updateRun(
    runId: string,
    data: {
        status?: RunStatus;
        lifecycleMode?: string;
        providerTaskId?: string | null;
        providerRaw?: unknown;
        result?: unknown;
        error?: unknown;
        artifactJson?: unknown;
        skillCallId?: number | null;
        attemptsIncrement?: number;
        nextPollAt?: Date | null;
        costUSD?: number | null;
    },
) {
    await prisma.$executeRawUnsafe(
        `UPDATE "SkillRun"
         SET status = COALESCE($2, status),
             "lifecycleMode" = COALESCE($3, "lifecycleMode"),
             "providerTaskId" = COALESCE($4, "providerTaskId"),
             "providerRaw" = COALESCE($5::jsonb, "providerRaw"),
             result = COALESCE($6::jsonb, result),
             error = COALESCE($7::jsonb, error),
             "artifactJson" = COALESCE($8::jsonb, "artifactJson"),
             "skillCallId" = COALESCE($9, "skillCallId"),
             attempts = attempts + $10,
             "nextPollAt" = $11,
             "costUSD" = COALESCE($12, "costUSD"),
             "updatedAt" = NOW()
         WHERE id = $1`,
        runId,
        data.status ?? null,
        data.lifecycleMode ?? null,
        data.providerTaskId ?? null,
        data.providerRaw === undefined ? null : JSON.stringify(data.providerRaw),
        data.result === undefined ? null : JSON.stringify(data.result),
        data.error === undefined ? null : JSON.stringify(data.error),
        data.artifactJson === undefined ? null : JSON.stringify(data.artifactJson),
        data.skillCallId ?? null,
        data.attemptsIncrement ?? 0,
        data.nextPollAt ?? null,
        data.costUSD ?? null,
    );
}

async function getSkillMeta(skillId: number): Promise<{ name: string; category: string | null; publisherId: string | null; revenueShare: number | null; trialAvailable: boolean } | null> {
    const rows = await prisma.$queryRawUnsafe<{ name: string; category: string | null; publisherId: string | null; revenueShare: number | null; trialAvailable: boolean }[]>(
        `SELECT s.name, s.category, s."publisherId", s."trialAvailable", p."revenueShare"
         FROM "Skill" s
         LEFT JOIN "Publisher" p ON p.id = s."publisherId"
         WHERE s.id = $1
         LIMIT 1`,
        skillId,
    );
    return rows[0] ?? null;
}

async function storeFinalResult(input: {
    source: SkillRunSource;
    runId: string;
    userId: number;
    sessionId: string;
    skillId: number;
    provider: ScoredProvider;
    estimatedCostUSD: number;
    actualCostUSD: number;
    charge: Pick<SkillCharge, "promoRedemptionId" | "promoCoveredUSD" | "balanceChargedUSD">;
    params: Record<string, unknown>;
    result: unknown;
    skipBillingAdjustments?: boolean;
}) {
    const deltaUSD = input.actualCostUSD - input.estimatedCostUSD;
    if (input.skipBillingAdjustments) {
        // Anonymous trials are platform-sponsored. Keep cost reporting, but do not debit or refund a user balance.
    } else if (deltaUSD > 0) {
        const extraCharge = await deductSkillUsage(input.userId, input.skillId, deltaUSD);
        if (extraCharge.error) {
            console.error("[storeFinalResult] extra charge failed after provider success", {
                runId: input.runId,
                userId: input.userId,
                skillId: input.skillId,
                deltaUSD,
            });
        }
    } else if (deltaUSD < 0) {
        const refundUSD = Math.abs(deltaUSD);
        const balanceRefundUSD = Math.min(input.charge.balanceChargedUSD, refundUSD);
        const promoRefundUSD = Math.min(input.charge.promoCoveredUSD, Math.max(0, refundUSD - balanceRefundUSD));
        if (balanceRefundUSD > 0 || promoRefundUSD > 0) {
            await refundSkillUsage(input.userId, {
                promoRedemptionId: input.charge.promoRedemptionId,
                promoCoveredUSD: promoRefundUSD,
                balanceChargedUSD: balanceRefundUSD,
            });
        }
    }

    const artifactResult = await storeSkillResultArtifacts({
        source: input.source,
        userId: input.userId,
        sessionId: input.sessionId,
        skillId: input.skillId,
        providerId: input.provider.id,
        providerName: input.provider.name,
        costUSD: input.actualCostUSD,
        params: input.params,
        result: input.result,
    });
    await updateRun(input.runId, {
        status: "succeeded",
        result: input.result,
        artifactJson: artifactResult,
        costUSD: input.actualCostUSD,
        nextPollAt: null,
    });
    return artifactResult;
}

async function pollKieProvider(provider: ScoredProvider, providerTaskId: string, internalBaseUrl?: string): Promise<AsyncProviderPollResult> {
    const submitPath = typeof provider.syncConfig?.apiPath === "string" ? provider.syncConfig.apiPath : "";
    const recordInfoPath = submitPath === "/api/v1/veo/generate"
        ? "/api/v1/veo/record-info"
        : "/api/v1/jobs/recordInfo";
    return executeSkillViaProvider(
        provider,
        {
            requestType: "jobs.recordInfo",
            apiPath: recordInfoPath,
            taskId: providerTaskId,
        },
        "",
        false,
        internalBaseUrl,
        false,
    );
}

const kieAsyncAdapter: AsyncProviderAdapter = {
    name: "kie",
    matches(provider, initialData) {
        const config = provider.syncConfig ?? {};
        const requestType = typeof config.requestType === "string" ? config.requestType : "";
        if (!isKieProvider(provider) || requestType === "jobs.recordInfo") return false;
        return requestType === "jobs.createTask" || Boolean(extractProviderTaskId(initialData));
    },
    poll: pollKieProvider,
    normalize: normalizeKieRecordInfo,
};

const apifyAsyncAdapter: AsyncProviderAdapter = {
    name: "apify",
    matches(provider, initialData) {
        if (!isApifyProvider(provider)) return false;
        if (!isPlainObject(initialData)) return false;
        const status = String(initialData.status ?? "").toUpperCase();
        if (status === "SUCCEEDED" && Array.isArray(initialData.items)) return false;
        return Boolean(initialData.runId ?? initialData.run_id ?? initialData.taskId ?? initialData.task_id);
    },
    poll(provider, providerTaskId, internalBaseUrl) {
        return executeSkillViaProvider(
            {
                ...provider,
                syncConfig: {
                    ...(provider.syncConfig ?? {}),
                    timeoutMs: 60_000,
                },
            },
            {
                requestType: "apify.getRunResult",
                runId: providerTaskId,
            },
            "",
            false,
            internalBaseUrl,
            false,
        );
    },
    normalize: normalizeApifyRunResult,
};

const asyncProviderAdapters: AsyncProviderAdapter[] = [
    kieAsyncAdapter,
    apifyAsyncAdapter,
];

function getAsyncProviderAdapter(provider: ScoredProvider, initialData?: unknown): AsyncProviderAdapter | null {
    return asyncProviderAdapters.find((adapter) => adapter.matches(provider, initialData)) ?? null;
}

async function waitForProviderResult(input: {
    runId: string;
    source: SkillRunSource;
    newApiUserId: number;
    sessionId: string;
    skillId: number;
    provider: ScoredProvider;
    providerTaskId: string;
    skillCallId?: number | null;
    publisherId?: string | null;
    revenueShare?: number | null;
    params: Record<string, unknown>;
    estimatedCostUSD: number;
    maxWaitSeconds: number;
    internalBaseUrl?: string;
    charge: Pick<SkillCharge, "promoRedemptionId" | "promoCoveredUSD" | "balanceChargedUSD">;
    billingMode?: "paid" | "trial";
}): Promise<RunSkillResult> {
    const adapter = getAsyncProviderAdapter(input.provider, { taskId: input.providerTaskId });
    if (!adapter) {
        const error = {
            code: "ASYNC_PROVIDER_UNSUPPORTED",
            message: `Async polling is not configured for provider ${input.provider.name}.`,
            retryable: false,
        };
        await updateRun(input.runId, { status: "failed", error, nextPollAt: null });
        return {
            status: "failed",
            runId: input.runId,
            skillId: input.skillId,
            providerId: input.provider.id,
            provider: input.provider.name,
            providerTaskId: input.providerTaskId,
            error,
        };
    }

    const deadline = Date.now() + Math.max(1, input.maxWaitSeconds) * 1000;
    let lastData: unknown = null;

    while (Date.now() < deadline) {
        await sleep(2000);
        const polled = await adapter.poll(input.provider, input.providerTaskId, input.internalBaseUrl);
        lastData = polled.data;
        await updateRun(input.runId, {
            providerRaw: polled.data,
            attemptsIncrement: 1,
            nextPollAt: new Date(Date.now() + 2000),
        });

        if (!polled.success) {
            const normalized = adapter.normalize(polled.data);
            if (normalized.status === "failed") {
                if (input.billingMode !== "trial") {
                    await refundSkillUsage(input.newApiUserId, input.charge).catch((error) => {
                        console.error("[waitForProviderResult] refund failed:", error);
                    });
                }
                await updateRun(input.runId, {
                    status: "failed",
                    error: normalized.error,
                    nextPollAt: null,
                });
                return {
                    status: "failed",
                    runId: input.runId,
                    skillId: input.skillId,
                    providerId: input.provider.id,
                    provider: input.provider.name,
                    providerTaskId: input.providerTaskId,
                    error: normalized.error,
                };
            }
            continue;
        }

        const normalized = adapter.normalize(polled.data);
        if (normalized.status === "succeeded") {
            const actualCostUSD = resolveActualCostUSD(input.provider, normalized.data, input.estimatedCostUSD);
            const artifactResult = await storeFinalResult({
                source: input.source,
                runId: input.runId,
                userId: input.newApiUserId,
                sessionId: input.sessionId,
                skillId: input.skillId,
                provider: input.provider,
                estimatedCostUSD: input.estimatedCostUSD,
                actualCostUSD,
                charge: input.charge,
                params: input.params,
                result: normalized.data,
                skipBillingAdjustments: input.billingMode === "trial",
            });
            if (input.skillCallId != null) {
                await updateSkillCallCost(input.skillCallId, actualCostUSD).catch((error) => {
                    console.error("[waitForProviderResult] updateSkillCallCost:", error);
                });
            }
            if (input.billingMode !== "trial" && input.publisherId && input.revenueShare != null && actualCostUSD > 0 && input.skillCallId != null) {
                void createSkillRevenue({
                    skillId: input.skillId,
                    publisherId: input.publisherId,
                    skillCallId: input.skillCallId,
                    grossUSD: actualCostUSD,
                    revenueShare: Number(input.revenueShare),
                }).catch(() => {});
            }
            void logServiceUsage(input.newApiUserId, "skill", input.provider.name, actualCostUSD, {
                skillId: input.skillId,
                runId: input.runId,
                providerTaskId: input.providerTaskId,
                actualCostUSD,
            }).catch((error) => console.error("[waitForProviderResult] logServiceUsage:", error));
            return {
                status: "succeeded",
                runId: input.runId,
                skillId: input.skillId,
                providerId: input.provider.id,
                provider: input.provider.name,
                providerTaskId: input.providerTaskId,
                costUSD: actualCostUSD,
                data: normalized.data,
                artifact: artifactResult.artifact,
                artifacts: artifactResult.artifacts,
            };
        }

        if (normalized.status === "failed") {
            if (input.billingMode !== "trial") {
                await refundSkillUsage(input.newApiUserId, input.charge).catch((error) => {
                    console.error("[waitForProviderResult] refund failed:", error);
                });
            }
            await updateRun(input.runId, {
                status: "failed",
                error: normalized.error,
                nextPollAt: null,
            });
            return {
                status: "failed",
                runId: input.runId,
                skillId: input.skillId,
                providerId: input.provider.id,
                provider: input.provider.name,
                providerTaskId: input.providerTaskId,
                error: normalized.error,
            };
        }
    }

    const nextPollAt = new Date(Date.now() + 5000);
    await updateRun(input.runId, {
        status: "running",
        providerRaw: lastData,
        nextPollAt,
    });
    return {
        status: "running",
        runId: input.runId,
        skillId: input.skillId,
        providerId: input.provider.id,
        provider: input.provider.name,
        providerTaskId: input.providerTaskId,
        nextPollAt: nextPollAt.toISOString(),
        costUSD: input.estimatedCostUSD,
    };
}

export async function runSkill(input: RunSkillInput): Promise<RunSkillResult> {
    const params = input.params ?? {};
    const waitForResult = input.waitForResult ?? true;
    const maxWaitSeconds = Math.min(input.maxWaitSeconds ?? DEFAULT_WAIT_SECONDS, MAX_WAIT_SECONDS);
    const sessionId = input.sessionId ?? `run-${input.newApiUserId}-${new Date().toISOString().slice(0, 10)}`;

    let skillId = input.skillId;
    let skillName: string | undefined;
    if (!skillId) {
        const exactMatch = await findExactSkillByIntentWithFilters(input.intent, { trialOnly: input.trialOnly });
        const matches = exactMatch ? [] : await discoverSkills(input.intent, 0, { trialOnly: input.trialOnly });
        if (!exactMatch && hasCloseSkillVariants(input.intent, matches)) {
            const runId = await createRun({
                newApiUserId: input.newApiUserId,
                sessionId,
                skillId: 0,
                status: "failed",
                lifecycleMode: "none",
                error: {
                    code: "SKILL_SELECTION_REQUIRED",
                    message: "Multiple matching skills found. Choose one skillId and call aporto_run_skill again with that skillId.",
                    retryable: false,
                },
            });
            return {
                status: "needs_selection",
                runId,
                skillId: 0,
                choices: selectionChoices(matches),
                error: {
                    code: "SKILL_SELECTION_REQUIRED",
                    message: "Multiple matching skills found. Choose one skillId and call aporto_run_skill again with that skillId.",
                    retryable: false,
                },
            };
        }
        const match = exactMatch ?? matches[0];
        if (!match) {
            const runId = await createRun({
                newApiUserId: input.newApiUserId,
                sessionId,
                skillId: 0,
                status: "failed",
                lifecycleMode: "none",
                error: { code: "NO_MATCHING_SKILL", message: "No matching live skill found.", retryable: false },
            });
            return {
                status: "failed",
                runId,
                skillId: 0,
                error: { code: "NO_MATCHING_SKILL", message: "No matching live skill found.", retryable: false },
            };
        }
        skillId = match.id;
        skillName = match.name;
    }

    const skillMeta = await getSkillMeta(skillId);
    if (!skillMeta) {
        const runId = await createRun({
            newApiUserId: input.newApiUserId,
            sessionId,
            skillId,
            status: "failed",
            lifecycleMode: "none",
            error: { code: "SKILL_NOT_FOUND", message: "Skill not found.", retryable: false },
        });
        return {
            status: "failed",
            runId,
            skillId,
            error: { code: "SKILL_NOT_FOUND", message: "Skill not found.", retryable: false },
        };
    }
    skillName ??= skillMeta.name;
    if (input.trialOnly && !skillMeta.trialAvailable) {
        const runId = await createRun({
            newApiUserId: input.newApiUserId,
            sessionId,
            skillId,
            status: "failed",
            lifecycleMode: "none",
            error: {
                code: "TRIAL_SKILL_NOT_AVAILABLE",
                message: "This skill is not available for trial runs. Get an API key at https://aporto.tech to run the full skill catalog.",
                retryable: false,
            },
        });
        return {
            status: "failed",
            runId,
            skillId,
            skillName,
            error: {
                code: "TRIAL_SKILL_NOT_AVAILABLE",
                message: "This skill is not available for trial runs. Get an API key at https://aporto.tech to run the full skill catalog.",
                retryable: false,
            },
        };
    }

    const paramsHash = computeSkillParamsHash(skillId, params);
    const isThirdParty = skillMeta.publisherId !== null;
    const providerHint = input.providerHint ?? input.intent;

    // Provider retry loop: try up to MAX_PROVIDER_ATTEMPTS providers on transient failures.
    // Each failed attempt refunds the charge and excludes the provider from subsequent tries.
    // Non-retryable errors (error_4xx) or insufficient balance stop immediately.
    type AttemptResult = {
        provider: ScoredProvider;
        executed: Awaited<ReturnType<typeof executeSkillViaProvider>>;
        charge: SkillCharge;
        estimatedCostUSD: number;
        providerTaskId: string | null;
        lifecycleMode: "sync" | "async_poll";
        skillCallId: number;
    };
    const excludeProviderIds: number[] = [];
    let successAttempt: AttemptResult | null = null;
    let lastFailedProviderId: number | undefined;
    let lastErrorType: string | undefined;

    for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt++) {
        const attemptProvider = await selectProvider(
            skillId, sessionId, input.newApiUserId, paramsHash, isThirdParty,
            excludeProviderIds, providerHint, params,
        );
        if (!attemptProvider) break;
        excludeProviderIds.push(attemptProvider.id);
        lastFailedProviderId = attemptProvider.id;

        const attemptCostUSD = attemptProvider.costPerChar != null && typeof params.text === "string"
            ? Math.max(0.0001, params.text.length * attemptProvider.costPerChar)
            : attemptProvider.pricePerCall;
        const attemptCharge = input.billingMode === "trial"
            ? { requestedUSD: attemptCostUSD, promoRedemptionId: null, promoCoveredUSD: 0, balanceChargedUSD: 0, error: null }
            : await deductSkillUsage(input.newApiUserId, skillId, attemptCostUSD);
        if (attemptCharge.error) {
            const runId = await createRun({
                newApiUserId: input.newApiUserId,
                sessionId,
                skillId,
                providerId: attemptProvider.id,
                status: "failed",
                lifecycleMode: "none",
                paramsHash,
                costUSD: attemptCostUSD,
                error: { code: "INSUFFICIENT_BALANCE", message: "Insufficient balance.", retryable: false },
            });
            return {
                status: "failed",
                runId,
                skillId,
                skillName,
                providerId: attemptProvider.id,
                provider: attemptProvider.name,
                error: { code: "INSUFFICIENT_BALANCE", message: "Insufficient balance.", retryable: false },
            };
        }

        const attemptExecuted = await executeSkillViaProvider(
            attemptProvider, params, input.authHeader, isThirdParty, input.internalBaseUrl,
        );
        const attemptProviderTaskId = attemptExecuted.success ? extractProviderTaskId(attemptExecuted.data) : null;
        const attemptLifecycleMode = attemptExecuted.success ? lifecycleModeFor(attemptProvider, attemptExecuted.data) : "sync";

        void updateProviderStats(attemptProvider.id, attemptExecuted.latencyMs, attemptExecuted.success, attemptExecuted.errorType === "timeout")
            .catch((error) => console.error("[runSkill] updateProviderStats:", error));

        const attemptSkillCallId = await recordSkillCall({
            sessionId,
            newApiUserId: input.newApiUserId,
            skillId,
            providerId: attemptProvider.id,
            isRetry: attempt > 1,
            retryAttempt: attempt,
            latencyMs: attemptExecuted.latencyMs,
            success: attemptExecuted.success,
            costUSD: attemptExecuted.success ? attemptCostUSD : 0,
            promoCoveredUSD: attemptExecuted.success ? attemptCharge.promoCoveredUSD : 0,
            balanceChargedUSD: attemptExecuted.success ? attemptCharge.balanceChargedUSD : 0,
            paramsHash,
            errorType: attemptExecuted.errorType,
        });

        if (attemptExecuted.success) {
            successAttempt = {
                provider: attemptProvider,
                executed: attemptExecuted,
                charge: attemptCharge as SkillCharge,
                estimatedCostUSD: attemptCostUSD,
                providerTaskId: attemptProviderTaskId,
                lifecycleMode: attemptLifecycleMode,
                skillCallId: attemptSkillCallId,
            };
            break;
        }

        lastErrorType = attemptExecuted.errorType;
        if (input.billingMode !== "trial") {
            void refundSkillUsage(input.newApiUserId, attemptCharge as SkillCharge)
                .catch((error) => console.error("[runSkill] refund failed:", error));
        }
        // Auto-disable failing Apify providers when the skill has other active providers,
        // so bad actors don't keep being selected on future runs.
        if (isApifyProvider(attemptProvider)) {
            void disableProviderIfOthersActive(attemptProvider.id, skillId)
                .catch((error) => console.error("[runSkill] disableProviderIfOthersActive:", error));
        }
        if (attemptExecuted.errorType === "error_4xx") break;
    }

    if (!successAttempt) {
        if (excludeProviderIds.length === 0) {
            await deactivateSkillIfNoActiveProviders(skillId);
        }
        const error = excludeProviderIds.length === 0
            ? { code: "NO_ACTIVE_PROVIDER", message: "No active providers available for this skill.", retryable: true }
            : {
                code: lastErrorType?.toUpperCase() ?? "PROVIDER_ERROR",
                message: "Provider submit failed.",
                retryable: lastErrorType !== "error_4xx",
            };
        const runId = await createRun({
            newApiUserId: input.newApiUserId,
            sessionId,
            skillId,
            providerId: lastFailedProviderId,
            status: "failed",
            lifecycleMode: "none",
            paramsHash,
            error,
        });
        return {
            status: "failed",
            runId,
            skillId,
            skillName,
            error,
        };
    }

    const { provider, executed, charge, estimatedCostUSD, providerTaskId, lifecycleMode, skillCallId } = successAttempt;
    const runId = await createRun({
        newApiUserId: input.newApiUserId,
        sessionId,
        skillId,
        providerId: provider.id,
        status: lifecycleMode === "async_poll" ? "running" : "succeeded",
        lifecycleMode,
        paramsHash,
        providerTaskId,
        providerRaw: executed.data,
        costUSD: estimatedCostUSD,
        promoRedemptionId: charge.promoRedemptionId,
        promoCoveredUSD: charge.promoCoveredUSD,
        balanceChargedUSD: charge.balanceChargedUSD,
        nextPollAt: lifecycleMode === "async_poll" ? new Date(Date.now() + 2000) : null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await updateRun(runId, { skillCallId });

    const shouldWaitInline = waitForResult;

    if (lifecycleMode === "async_poll" && providerTaskId) {
        if (!shouldWaitInline) {
            return {
                status: "running",
                runId,
                skillId,
                skillName,
                providerId: provider.id,
                provider: provider.name,
                providerTaskId,
                nextPollAt: new Date(Date.now() + 2000).toISOString(),
                costUSD: estimatedCostUSD,
            };
        }
        return {
            skillName,
            ...(await waitForProviderResult({
                runId,
                source: input.source,
                newApiUserId: input.newApiUserId,
                sessionId,
                skillId,
                provider,
                providerTaskId,
                publisherId: skillMeta.publisherId,
                revenueShare: skillMeta.revenueShare,
                params,
                estimatedCostUSD,
                maxWaitSeconds,
                internalBaseUrl: input.internalBaseUrl,
                skillCallId,
                charge,
                billingMode: input.billingMode,
            })),
        };
    }

    const actualCostUSD = resolveActualCostUSD(provider, executed.data, estimatedCostUSD);
    const artifactResult = await storeFinalResult({
        source: input.source,
        runId,
        userId: input.newApiUserId,
        sessionId,
        skillId,
        provider,
        estimatedCostUSD,
        actualCostUSD,
        charge,
        params,
        result: executed.data,
        skipBillingAdjustments: input.billingMode === "trial",
    });
    if (skillCallId != null) {
        await updateSkillCallCost(skillCallId, actualCostUSD).catch((error) => {
            console.error("[runSkill] updateSkillCallCost:", error);
        });
    }
    if (input.billingMode !== "trial" && skillMeta.publisherId && skillMeta.revenueShare != null && actualCostUSD > 0) {
        void createSkillRevenue({
            skillId,
            publisherId: skillMeta.publisherId,
            skillCallId,
            grossUSD: actualCostUSD,
            revenueShare: Number(skillMeta.revenueShare),
        }).catch(() => {});
    }
    void logServiceUsage(input.newApiUserId, "skill", provider.name, actualCostUSD, {
        skillId,
        runId,
        latencyMs: executed.latencyMs,
        errorType: executed.errorType,
    }).catch((error) => console.error("[runSkill] logServiceUsage:", error));
    return {
        status: "succeeded",
        runId,
        skillId,
        skillName,
        providerId: provider.id,
        provider: provider.name,
        costUSD: actualCostUSD,
        data: executed.data,
        artifact: artifactResult.artifact,
        artifacts: artifactResult.artifacts,
    };
}

export async function getSkillRun(input: {
    source: SkillRunSource;
    newApiUserId: number;
    runId: string;
    waitForResult?: boolean;
    maxWaitSeconds?: number;
    internalBaseUrl?: string;
}): Promise<RunSkillResult | null> {
    const rows = await prisma.$queryRawUnsafe<SkillRunRow[]>(
        `SELECT id, "newApiUserId", "sessionId", "skillId", "providerId", "skillCallId",
                status, "lifecycleMode", "providerTaskId", result, error,
                "artifactJson", "costUSD", "promoRedemptionId", "promoCoveredUSD", "balanceChargedUSD"
         FROM "SkillRun"
         WHERE id = $1 AND "newApiUserId" = $2
         LIMIT 1`,
        input.runId,
        input.newApiUserId,
    );
    const run = rows[0];
    if (!run) return null;

    if (run.status === "succeeded") {
        const artifactJson = isPlainObject(run.artifactJson) ? run.artifactJson as { artifact?: StoredArtifact; artifacts?: StoredArtifact[] } : {};
        return {
            status: "succeeded",
            runId: run.id,
            skillId: run.skillId,
            providerId: run.providerId ?? undefined,
            providerTaskId: run.providerTaskId ?? undefined,
            costUSD: run.costUSD ?? undefined,
            data: run.result,
            artifact: artifactJson.artifact,
            artifacts: artifactJson.artifacts,
        };
    }

    if (run.status === "failed") {
        return {
            status: "failed",
            runId: run.id,
            skillId: run.skillId,
            providerId: run.providerId ?? undefined,
            providerTaskId: run.providerTaskId ?? undefined,
            costUSD: run.costUSD ?? undefined,
            error: isPlainObject(run.error)
                ? run.error as RunSkillResult["error"]
                : { code: "RUN_FAILED", message: "Skill run failed.", retryable: false },
        };
    }

    if (!input.waitForResult || run.lifecycleMode !== "async_poll" || !run.providerId || !run.providerTaskId) {
        return {
            status: run.status === "waiting" ? "waiting" : "running",
            runId: run.id,
            skillId: run.skillId,
            providerId: run.providerId ?? undefined,
            providerTaskId: run.providerTaskId ?? undefined,
            costUSD: run.costUSD ?? undefined,
            nextPollAt: new Date(Date.now() + 5000).toISOString(),
        };
    }

    const providerRows = await prisma.$queryRawUnsafe<ProviderLookupRow[]>(
        `SELECT id, name, endpoint, "pricePerCall" AS price_per_call, "costPerChar" AS cost_per_char,
                "avgLatencyMs" AS avg_latency_ms, "retryRate" AS retry_rate, "timeoutRate" AS timeout_rate,
                "providerSecret" AS secret, "syncConfig" AS sync_config
         FROM "Provider"
         WHERE id = $1 AND "isActive" = true
         LIMIT 1`,
        run.providerId,
    );
    const row = providerRows[0];
    if (!row) {
        return {
            status: "failed",
            runId: run.id,
            skillId: run.skillId,
            error: { code: "PROVIDER_NOT_FOUND", message: "Provider for this run is no longer active.", retryable: false },
        };
    }
    const provider = providerFromRow(row);

    return waitForProviderResult({
        runId: run.id,
        source: input.source,
        newApiUserId: input.newApiUserId,
        sessionId: run.sessionId,
        skillId: run.skillId,
        provider,
        providerTaskId: run.providerTaskId,
        skillCallId: run.skillCallId,
        params: {},
        estimatedCostUSD: run.costUSD ?? 0,
        maxWaitSeconds: Math.min(input.maxWaitSeconds ?? DEFAULT_WAIT_SECONDS, MAX_WAIT_SECONDS),
        internalBaseUrl: input.internalBaseUrl,
        charge: {
            promoRedemptionId: run.promoRedemptionId,
            promoCoveredUSD: Number(run.promoCoveredUSD ?? 0),
            balanceChargedUSD: Number(run.balanceChargedUSD ?? 0),
        },
    });
}

export async function pollSkillRunById(input: {
    runId: string;
    source?: SkillRunSource;
    maxWaitSeconds?: number;
    internalBaseUrl?: string;
}): Promise<RunSkillResult | null> {
    const rows = await prisma.$queryRawUnsafe<SkillRunRow[]>(
        `SELECT id, "newApiUserId", "sessionId", "skillId", "providerId", "skillCallId",
                status, "lifecycleMode", "providerTaskId", result, error,
                "artifactJson", "costUSD", "promoRedemptionId", "promoCoveredUSD", "balanceChargedUSD"
         FROM "SkillRun"
         WHERE id = $1
         LIMIT 1`,
        input.runId,
    );
    const run = rows[0];
    if (!run) return null;

    if (!["running", "waiting"].includes(run.status) || run.lifecycleMode !== "async_poll" || !run.providerId || !run.providerTaskId) {
        return getSkillRun({
            source: input.source ?? "rest",
            newApiUserId: run.newApiUserId,
            runId: run.id,
            waitForResult: false,
            maxWaitSeconds: input.maxWaitSeconds,
            internalBaseUrl: input.internalBaseUrl,
        });
    }

    const providerRows = await prisma.$queryRawUnsafe<ProviderLookupRow[]>(
        `SELECT id, name, endpoint, "pricePerCall" AS price_per_call, "costPerChar" AS cost_per_char,
                "avgLatencyMs" AS avg_latency_ms, "retryRate" AS retry_rate, "timeoutRate" AS timeout_rate,
                "providerSecret" AS secret, "syncConfig" AS sync_config
         FROM "Provider"
         WHERE id = $1 AND "isActive" = true
         LIMIT 1`,
        run.providerId,
    );
    const row = providerRows[0];
    if (!row) {
        const error = { code: "PROVIDER_NOT_FOUND", message: "Provider for this run is no longer active.", retryable: false };
        await updateRun(run.id, { status: "failed", error, nextPollAt: null });
        return {
            status: "failed",
            runId: run.id,
            skillId: run.skillId,
            providerId: run.providerId,
            providerTaskId: run.providerTaskId,
            error,
        };
    }

    return waitForProviderResult({
        runId: run.id,
        source: input.source ?? "rest",
        newApiUserId: run.newApiUserId,
        sessionId: run.sessionId,
        skillId: run.skillId,
        provider: providerFromRow(row),
        providerTaskId: run.providerTaskId,
        skillCallId: run.skillCallId,
        params: {},
        estimatedCostUSD: run.costUSD ?? 0,
        maxWaitSeconds: Math.min(input.maxWaitSeconds ?? 5, MAX_WAIT_SECONDS),
        internalBaseUrl: input.internalBaseUrl,
        charge: {
            promoRedemptionId: run.promoRedemptionId,
            promoCoveredUSD: Number(run.promoCoveredUSD ?? 0),
            balanceChargedUSD: Number(run.balanceChargedUSD ?? 0),
        },
    });
}

export async function pollDueSkillRuns(input: {
    limit?: number;
    maxWaitSecondsPerRun?: number;
    internalBaseUrl?: string;
} = {}): Promise<PollDueSkillRunsResult> {
    const limit = Math.min(50, Math.max(1, input.limit ?? 10));
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `UPDATE "SkillRun"
         SET status = 'waiting',
             "nextPollAt" = NOW() + INTERVAL '60 seconds',
             "updatedAt" = NOW()
         WHERE id IN (
             SELECT id
             FROM "SkillRun"
             WHERE status = 'running'
               AND "lifecycleMode" = 'async_poll'
               AND "providerTaskId" IS NOT NULL
               AND ("nextPollAt" IS NULL OR "nextPollAt" <= NOW())
               AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
             ORDER BY "nextPollAt" ASC NULLS FIRST, "createdAt" ASC
             FOR UPDATE SKIP LOCKED
             LIMIT $1
         )
         RETURNING id`,
        limit,
    );

    const summary: PollDueSkillRunsResult = {
        checked: 0,
        succeeded: 0,
        failed: 0,
        running: 0,
        errors: [],
        runs: [],
    };

    for (const row of rows) {
        summary.checked += 1;
        try {
            const result = await pollSkillRunById({
                runId: row.id,
                source: "rest",
                maxWaitSeconds: input.maxWaitSecondsPerRun ?? 5,
                internalBaseUrl: input.internalBaseUrl,
            });
            if (!result) continue;
            summary.runs.push(result);
            if (result.status === "succeeded") summary.succeeded += 1;
            else if (result.status === "failed") summary.failed += 1;
            else summary.running += 1;
        } catch (error) {
            summary.errors.push({ runId: row.id, error: String(error) });
        }
    }

    return summary;
}
