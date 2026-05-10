import { createHash } from "crypto";
import { deductUserQuota, logServiceUsage } from "@/lib/serviceProxy";
import { prisma } from "@/lib/prisma";
import { storeSkillResultArtifacts, type StoredArtifact } from "@/lib/artifacts";
import {
    createSkillRevenue,
    deactivateSkillIfNoActiveProviders,
    discoverSkills,
    executeSkillViaProvider,
    recordSkillCall,
    selectProvider,
    updateProviderStats,
    type ScoredProvider,
} from "@/lib/routing";

const QUOTA_PER_DOLLAR = 500_000;
const DEFAULT_WAIT_SECONDS = 45;
const MAX_WAIT_SECONDS = 55;

type SkillRunSource = "mcp" | "rest";

type RunStatus = "succeeded" | "running" | "waiting" | "failed";

type RunSkillInput = {
    source: SkillRunSource;
    newApiUserId: number;
    authHeader: string;
    intent: string;
    params?: Record<string, unknown>;
    skillId?: number;
    providerHint?: string;
    waitForResult?: boolean;
    maxWaitSeconds?: number;
    sessionId?: string;
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
    error?: {
        code: string;
        message: string;
        cause?: string;
        retryable: boolean;
    };
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

function normalizeKieRecordInfo(data: unknown): { status: RunStatus; data?: unknown; error?: RunSkillResult["error"] } {
    const payload = isPlainObject(data) && isPlainObject(data.data) ? data.data : data;
    if (!isPlainObject(payload)) return { status: "running" };

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
        const parsedResult = parseJsonMaybe(payload.resultJson);
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

function extractProviderTaskId(data: unknown): string | null {
    return findStringKey(data, ["taskId", "task_id", "recordId", "runId", "run_id", "jobId", "job_id"]);
}

function lifecycleModeFor(provider: ScoredProvider, data: unknown): "sync" | "async_poll" {
    const config = provider.syncConfig ?? {};
    const requestType = typeof config.requestType === "string" ? config.requestType : "";
    if (requestType === "jobs.createTask") return "async_poll";
    if (extractProviderTaskId(data) && /\/api\/providers\/kie$/.test(provider.endpoint)) return "async_poll";
    return "sync";
}

async function refundQuota(newApiUserId: number, costUSD: number) {
    if (costUSD <= 0) return;
    await prisma.$executeRawUnsafe(
        `UPDATE users SET quota = quota + $1, used_quota = used_quota - $1 WHERE id = $2`,
        Math.ceil(costUSD * QUOTA_PER_DOLLAR),
        newApiUserId,
    );
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
    nextPollAt?: Date | null;
    expiresAt?: Date | null;
}): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "SkillRun" (
            "newApiUserId", "sessionId", "skillId", "providerId", status,
            "lifecycleMode", "paramsHash", "providerTaskId", "providerRaw",
            result, error, "costUSD", "nextPollAt", "expiresAt", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, NOW(), NOW())
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
    );
}

async function getSkillMeta(skillId: number): Promise<{ name: string; category: string | null; publisherId: string | null; revenueShare: number | null } | null> {
    const rows = await prisma.$queryRawUnsafe<{ name: string; category: string | null; publisherId: string | null; revenueShare: number | null }[]>(
        `SELECT s.name, s.category, s."publisherId", p."revenueShare"
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
    costUSD: number;
    params: Record<string, unknown>;
    result: unknown;
}) {
    const artifactResult = await storeSkillResultArtifacts({
        source: input.source,
        userId: input.userId,
        sessionId: input.sessionId,
        skillId: input.skillId,
        providerId: input.provider.id,
        providerName: input.provider.name,
        costUSD: input.costUSD,
        params: input.params,
        result: input.result,
    });
    await updateRun(input.runId, {
        status: "succeeded",
        result: input.result,
        artifactJson: artifactResult,
        nextPollAt: null,
    });
    return artifactResult;
}

async function pollKieProvider(provider: ScoredProvider, providerTaskId: string): Promise<{
    success: boolean;
    data: unknown;
    latencyMs: number;
    errorType: "success" | "timeout" | "network_error" | "error_5xx" | "error_4xx";
}> {
    return executeSkillViaProvider(
        provider,
        {
            requestType: "jobs.recordInfo",
            apiPath: "/api/v1/jobs/recordInfo",
            taskId: providerTaskId,
        },
        "",
    );
}

async function waitForProviderResult(input: {
    runId: string;
    source: SkillRunSource;
    newApiUserId: number;
    sessionId: string;
    skillId: number;
    provider: ScoredProvider;
    providerTaskId: string;
    params: Record<string, unknown>;
    costUSD: number;
    maxWaitSeconds: number;
}): Promise<RunSkillResult> {
    const deadline = Date.now() + Math.max(1, input.maxWaitSeconds) * 1000;
    let lastData: unknown = null;

    while (Date.now() < deadline) {
        await sleep(2000);
        const polled = await pollKieProvider(input.provider, input.providerTaskId);
        lastData = polled.data;
        await updateRun(input.runId, {
            providerRaw: polled.data,
            attemptsIncrement: 1,
            nextPollAt: new Date(Date.now() + 2000),
        });

        if (!polled.success) {
            continue;
        }

        const normalized = normalizeKieRecordInfo(polled.data);
        if (normalized.status === "succeeded") {
            const artifactResult = await storeFinalResult({
                source: input.source,
                runId: input.runId,
                userId: input.newApiUserId,
                sessionId: input.sessionId,
                skillId: input.skillId,
                provider: input.provider,
                costUSD: input.costUSD,
                params: input.params,
                result: normalized.data,
            });
            return {
                status: "succeeded",
                runId: input.runId,
                skillId: input.skillId,
                providerId: input.provider.id,
                provider: input.provider.name,
                providerTaskId: input.providerTaskId,
                costUSD: input.costUSD,
                data: normalized.data,
                artifact: artifactResult.artifact,
                artifacts: artifactResult.artifacts,
            };
        }

        if (normalized.status === "failed") {
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
        costUSD: input.costUSD,
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
        const matches = await discoverSkills(input.intent, 0);
        const match = matches[0];
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

    const paramsHash = computeSkillParamsHash(skillId, params);
    const isThirdParty = skillMeta.publisherId !== null;
    const providerHint = input.providerHint ?? input.intent;
    const provider = await selectProvider(skillId, sessionId, input.newApiUserId, paramsHash, isThirdParty, [], providerHint);
    if (!provider) {
        await deactivateSkillIfNoActiveProviders(skillId);
        const runId = await createRun({
            newApiUserId: input.newApiUserId,
            sessionId,
            skillId,
            status: "failed",
            lifecycleMode: "none",
            paramsHash,
            error: { code: "NO_ACTIVE_PROVIDER", message: "No active providers available for this skill.", retryable: true },
        });
        return {
            status: "failed",
            runId,
            skillId,
            skillName,
            error: { code: "NO_ACTIVE_PROVIDER", message: "No active providers available for this skill.", retryable: true },
        };
    }

    const costUSD = provider.costPerChar != null && typeof params.text === "string"
        ? Math.max(0.0001, params.text.length * provider.costPerChar)
        : provider.pricePerCall;
    const balanceError = await deductUserQuota(input.newApiUserId, costUSD);
    if (balanceError) {
        const runId = await createRun({
            newApiUserId: input.newApiUserId,
            sessionId,
            skillId,
            providerId: provider.id,
            status: "failed",
            lifecycleMode: "none",
            paramsHash,
            costUSD,
            error: { code: "INSUFFICIENT_BALANCE", message: "Insufficient balance.", retryable: false },
        });
        return {
            status: "failed",
            runId,
            skillId,
            skillName,
            providerId: provider.id,
            provider: provider.name,
            error: { code: "INSUFFICIENT_BALANCE", message: "Insufficient balance.", retryable: false },
        };
    }

    const executed = await executeSkillViaProvider(provider, params, input.authHeader, isThirdParty);
    const providerTaskId = executed.success ? extractProviderTaskId(executed.data) : null;
    const lifecycleMode = executed.success ? lifecycleModeFor(provider, executed.data) : "sync";
    const runId = await createRun({
        newApiUserId: input.newApiUserId,
        sessionId,
        skillId,
        providerId: provider.id,
        status: executed.success ? (lifecycleMode === "async_poll" ? "running" : "succeeded") : "failed",
        lifecycleMode,
        paramsHash,
        providerTaskId,
        providerRaw: executed.data,
        costUSD,
        nextPollAt: lifecycleMode === "async_poll" ? new Date(Date.now() + 2000) : null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const skillCallId = await recordSkillCall({
        sessionId,
        newApiUserId: input.newApiUserId,
        skillId,
        providerId: provider.id,
        latencyMs: executed.latencyMs,
        success: executed.success,
        costUSD: executed.success ? costUSD : 0,
        paramsHash,
        errorType: executed.errorType,
    });
    await updateRun(runId, { skillCallId });

    void updateProviderStats(provider.id, executed.latencyMs, executed.success, executed.errorType === "timeout")
        .catch((error) => console.error("[runSkill] updateProviderStats:", error));
    void logServiceUsage(input.newApiUserId, "skill", provider.name, executed.success ? costUSD : 0, {
        skillId,
        runId,
        latencyMs: executed.latencyMs,
        errorType: executed.errorType,
    }).catch((error) => console.error("[runSkill] logServiceUsage:", error));

    if (!executed.success) {
        void refundQuota(input.newApiUserId, costUSD).catch((error) => console.error("[runSkill] refund failed:", error));
        const error = {
            code: executed.errorType.toUpperCase(),
            message: "Provider submit failed.",
            cause: JSON.stringify(executed.data),
            retryable: executed.errorType !== "error_4xx",
        };
        await updateRun(runId, { status: "failed", error, nextPollAt: null });
        return {
            status: "failed",
            runId,
            skillId,
            skillName,
            providerId: provider.id,
            provider: provider.name,
            costUSD: 0,
            error,
        };
    }

    if (skillMeta.publisherId && skillMeta.revenueShare != null && costUSD > 0) {
        void createSkillRevenue({
            skillId,
            publisherId: skillMeta.publisherId,
            skillCallId,
            grossUSD: costUSD,
            revenueShare: Number(skillMeta.revenueShare),
        }).catch(() => {});
    }

    const shouldWaitInline = waitForResult && skillMeta.category !== "media/video";

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
                costUSD,
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
                params,
                costUSD,
                maxWaitSeconds,
            })),
        };
    }

    const artifactResult = await storeFinalResult({
        source: input.source,
        runId,
        userId: input.newApiUserId,
        sessionId,
        skillId,
        provider,
        costUSD,
        params,
        result: executed.data,
    });
    return {
        status: "succeeded",
        runId,
        skillId,
        skillName,
        providerId: provider.id,
        provider: provider.name,
        costUSD,
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
}): Promise<RunSkillResult | null> {
    const rows = await prisma.$queryRawUnsafe<SkillRunRow[]>(
        `SELECT id, "newApiUserId", "sessionId", "skillId", "providerId", "skillCallId",
                status, "lifecycleMode", "providerTaskId", result, error,
                "artifactJson", "costUSD"
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

    const providerRows = await prisma.$queryRawUnsafe<{
        id: number; name: string; endpoint: string; price_per_call: number; cost_per_char: number | null;
        avg_latency_ms: number; retry_rate: number; timeout_rate: number; secret: string | null; sync_config: string | null;
    }[]>(
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
    const provider: ScoredProvider = {
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

    return waitForProviderResult({
        runId: run.id,
        source: input.source,
        newApiUserId: input.newApiUserId,
        sessionId: run.sessionId,
        skillId: run.skillId,
        provider,
        providerTaskId: run.providerTaskId,
        params: {},
        costUSD: run.costUSD ?? 0,
        maxWaitSeconds: Math.min(input.maxWaitSeconds ?? DEFAULT_WAIT_SECONDS, MAX_WAIT_SECONDS),
    });
}
