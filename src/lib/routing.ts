/**
 * Skill routing layer.
 *
 * discoverSkills    — semantic similarity search via pgvector, 5 per page
 * selectProvider    — score providers by price/latency/retryRate/timeoutRate;
 *                     exclude providers used by this session (24h) or same
 *                     paramsHash (2 min)
 * executeSkillViaProvider — HTTP POST to provider.endpoint with 10s timeout;
 *                     classifies errors as timeout | network_error | error_5xx | error_4xx
 * updateProviderStats     — fire-and-forget EMA update (alpha=0.2) for
 *                     avgLatencyMs, retryRate, and timeoutRate
 */

import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embeddings";

const PAGE_SIZE = 5;
export const MAX_PROVIDER_ATTEMPTS = Math.min(
    Math.max(Number(process.env.SKILL_MAX_PROVIDER_ATTEMPTS ?? 3) || 3, 1),
    5,
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveredSkill {
    id: number;
    name: string;
    description: string;
    category: string | null;
    capabilities: string[];
    inputTypes: string[];
    outputTypes: string[];
    paramsSchema: string | null;
    tags: string | null;
    similarity: number;
}

export interface ScoredProvider {
    id: number;
    name: string;
    endpoint: string;
    pricePerCall: number;
    /** If set, actual cost = costPerChar * params.text.length (overrides pricePerCall for variable-cost skills like TTS). */
    costPerChar: number | null;
    avgLatencyMs: number;
    retryRate: number;
    timeoutRate: number;
    /** Per-provider secret for outbound auth. When set, forwarded as Bearer token instead of caller's key. */
    secret: string | null;
    /** Provider-specific config merged into params before forwarding (e.g. { actorId: "..." } for Apify). */
    syncConfig: Record<string, unknown> | null;
}

type ErrorType = "success" | "timeout" | "network_error" | "error_5xx" | "error_4xx";
type ProviderRow = {
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

function toScoredProvider(row: ProviderRow): ScoredProvider {
    return {
        id: row.id,
        name: row.name,
        endpoint: row.endpoint,
        pricePerCall: Number(row.price_per_call),
        costPerChar: row.cost_per_char != null ? Number(row.cost_per_char) : null,
        avgLatencyMs: Number(row.avg_latency_ms),
        retryRate: Number(row.retry_rate),
        timeoutRate: Number(row.timeout_rate),
        secret: row.secret ?? null,
        syncConfig: row.sync_config ? JSON.parse(row.sync_config) : null,
    };
}

// ── discoverSkills ────────────────────────────────────────────────────────────

export async function discoverSkills(
    query: string,
    page = 0,
    filters?: { category?: string; capability?: string },
): Promise<DiscoveredSkill[]> {
    const embedding = await embedQuery(query);
    const vectorLiteral = `[${embedding.join(",")}]`;
    const offset = page * PAGE_SIZE;

    const conditions: string[] = [
        `"isActive" = true`,
        `embedding IS NOT NULL`,
        `status = 'live'`,
        `EXISTS (
            SELECT 1
            FROM "Provider" p
            WHERE p."skillId" = "Skill".id
              AND p."isActive" = true
        )`,
    ];
    const args: unknown[] = [vectorLiteral, PAGE_SIZE, offset];
    let argIdx = 4;

    if (filters?.category) {
        conditions.push(`category = $${argIdx++}`);
        args.push(filters.category);
    }
    if (filters?.capability) {
        conditions.push(`capabilities::text ILIKE $${argIdx++}`);
        args.push(`%"${filters.capability}"%`);
    }

    const where = conditions.join(" AND ");

    const rows = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string;
        category: string | null; capabilities: string | null;
        input_types: string | null; output_types: string | null;
        params_schema: string | null; tags: string | null; similarity: number;
    }[]>(
        `SELECT id, name, description, category, capabilities,
                "inputTypes" AS input_types, "outputTypes" AS output_types,
                "paramsSchema" AS params_schema, tags,
                1 - (embedding <=> $1::vector) AS similarity
         FROM "Skill"
         WHERE ${where}
         ORDER BY embedding <=> $1::vector
         LIMIT $2 OFFSET $3`,
        ...args,
    );

    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        capabilities: r.capabilities ? JSON.parse(r.capabilities) : [],
        inputTypes: r.input_types ? JSON.parse(r.input_types) : [],
        outputTypes: r.output_types ? JSON.parse(r.output_types) : [],
        paramsSchema: r.params_schema,
        tags: r.tags,
        similarity: Number(r.similarity),
    }));
}

// ── selectProvider ────────────────────────────────────────────────────────────

export async function selectProvider(
    skillId: number,
    sessionId: string,
    newApiUserId: number,
    paramsHash?: string,
    isThirdParty = false,
    excludeProviderIds: number[] = [],
): Promise<ScoredProvider | null> {
    // Unified CTE: exclude providers used in this session (24h) OR same paramsHash (2 min)
    // For third-party skills: also exclude providers without a providerSecret (T1 guard)
    const exclusions = Array.from(new Set(excludeProviderIds.filter((id) => Number.isInteger(id) && id > 0)));
    const exclusionClause = exclusions.length
        ? `AND p.id NOT IN (${exclusions.map((_, idx) => `$${idx + 6}`).join(", ")})`
        : "";

    const preferred = await selectAttributedProvider(skillId, newApiUserId, isThirdParty, exclusions);
    if (preferred) return preferred;

    const rows = await prisma.$queryRawUnsafe<
        ProviderRow[]
    >(
        `WITH used AS (
            SELECT DISTINCT "providerId"
            FROM "SkillCall"
            WHERE (
                "sessionId" = $1
                AND "newApiUserId" = $2
                AND "skillId" = $3
                AND "createdAt" > NOW() - INTERVAL '24 hours'
            )
            OR (
                $4::text IS NOT NULL
                AND "paramsHash" = $4
                AND "newApiUserId" = $2
                AND "createdAt" > NOW() - INTERVAL '2 minutes'
            )
        )
        SELECT
            p.id,
            p.name,
            p.endpoint,
            p."pricePerCall"    AS price_per_call,
            p."costPerChar"     AS cost_per_char,
            p."avgLatencyMs"    AS avg_latency_ms,
            p."retryRate"       AS retry_rate,
            p."timeoutRate"     AS timeout_rate,
            p."providerSecret"  AS secret,
            p."syncConfig"      AS sync_config
        FROM "Provider" p
        WHERE p."skillId" = $3
          AND p."isActive" = true
          AND p.id NOT IN (SELECT "providerId" FROM used)
          AND ($5 = false OR p."providerSecret" IS NOT NULL)
          ${exclusionClause}
        ORDER BY p.id`,
        sessionId,
        newApiUserId,
        skillId,
        paramsHash ?? null,
        isThirdParty,
        ...exclusions,
    );

    if (rows.length === 0) return null;

    // Min-max normalize then score:
    // 0.40*(1-normPrice) + 0.30*(1-normLatency) + 0.15*(1-retryRate) + 0.15*(1-timeoutRate)
    const prices = rows.map((r) => Number(r.price_per_call));
    const latencies = rows.map((r) => Number(r.avg_latency_ms));

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minLat = Math.min(...latencies);
    const maxLat = Math.max(...latencies);

    const scored = rows.map((r) => {
        const normPrice =
            maxPrice === minPrice ? 0.5 : (Number(r.price_per_call) - minPrice) / (maxPrice - minPrice);
        const normLat =
            maxLat === minLat ? 0.5 : (Number(r.avg_latency_ms) - minLat) / (maxLat - minLat);
        const score =
            0.40 * (1 - normPrice) +
            0.30 * (1 - normLat) +
            0.15 * (1 - Number(r.retry_rate)) +
            0.15 * (1 - Number(r.timeout_rate));
        return { ...r, score };
    });

    // Primary sort: score desc; tiebreaker: id asc (stable, deterministic)
    scored.sort((a, b) => b.score - a.score || a.id - b.id);
    const best = scored[0];
    return toScoredProvider(best);
}

async function selectAttributedProvider(
    skillId: number,
    newApiUserId: number,
    isThirdParty: boolean,
    excludeProviderIds: number[],
): Promise<ScoredProvider | null> {
    const exclusions = Array.from(new Set(excludeProviderIds.filter((id) => Number.isInteger(id) && id > 0)));
    const exclusionClause = exclusions.length
        ? `AND p.id NOT IN (${exclusions.map((_, idx) => `$${idx + 4}`).join(", ")})`
        : "";

    const rows = await prisma.$queryRawUnsafe<(ProviderRow & {
        attribution_id: number;
        success_threshold: number;
        min_calls: number;
        recent_calls: number;
        recent_successes: number;
    })[]>(
        `WITH recent AS (
            SELECT success
            FROM "SkillCall"
            WHERE "providerId" = (
                SELECT "providerId"
                FROM "ProviderAttribution"
                WHERE "newApiUserId" = $2
                  AND "skillId" = $1
                  AND status = 'active'
                LIMIT 1
            )
            ORDER BY "createdAt" DESC
            LIMIT 100
        )
        SELECT
            p.id,
            p.name,
            p.endpoint,
            p."pricePerCall"    AS price_per_call,
            p."costPerChar"     AS cost_per_char,
            p."avgLatencyMs"    AS avg_latency_ms,
            p."retryRate"       AS retry_rate,
            p."timeoutRate"     AS timeout_rate,
            p."providerSecret"  AS secret,
            p."syncConfig"      AS sync_config,
            a.id                AS attribution_id,
            a."successThreshold" AS success_threshold,
            a."minCalls"        AS min_calls,
            COUNT(recent.success)::int AS recent_calls,
            COUNT(recent.success) FILTER (WHERE recent.success = true)::int AS recent_successes
        FROM "ProviderAttribution" a
        JOIN "Provider" p ON p.id = a."providerId"
        LEFT JOIN recent ON true
        WHERE a."newApiUserId" = $2
          AND a."skillId" = $1
          AND a.status = 'active'
          AND p."skillId" = $1
          AND p."isActive" = true
          AND ($3 = false OR p."providerSecret" IS NOT NULL)
          ${exclusionClause}
        GROUP BY p.id, a.id
        LIMIT 1`,
        skillId,
        newApiUserId,
        isThirdParty,
        ...exclusions,
    );

    const row = rows[0];
    if (!row) return null;

    const recentCalls = Number(row.recent_calls);
    const recentSuccesses = Number(row.recent_successes);
    const successRate = recentCalls === 0 ? 1 : recentSuccesses / recentCalls;
    const minCalls = Number(row.min_calls);
    const threshold = Number(row.success_threshold);

    if (recentCalls >= minCalls && successRate < threshold) {
        await prisma.$executeRawUnsafe(
            `UPDATE "ProviderAttribution"
             SET status = 'expired_low_success_rate',
                 "updatedAt" = NOW()
             WHERE id = $1`,
            row.attribution_id,
        );
        return null;
    }

    return toScoredProvider(row);
}

export async function deactivateSkillIfNoActiveProviders(skillId: number): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count
         FROM "Provider"
         WHERE "skillId" = $1
           AND "isActive" = true`,
        skillId,
    );

    if ((rows[0]?.count ?? 0) > 0) return false;

    const updated = await prisma.$executeRawUnsafe(
        `UPDATE "Skill"
         SET "isActive" = false,
             "reviewNote" = 'Auto-disabled: no active providers available.',
             "lastEditedAt" = NOW()
         WHERE id = $1
           AND "isActive" = true`,
        skillId,
    );
    return updated > 0;
}

// ── executeSkillViaProvider ───────────────────────────────────────────────────

export async function executeSkillViaProvider(
    provider: ScoredProvider,
    params: Record<string, unknown>,
    authHeader: string,
    isThirdParty = false,
): Promise<{ success: boolean; data: unknown; latencyMs: number; errorType: ErrorType }> {
    // HTTPS-only enforcement (SSRF guard — admin controls endpoint URL)
    const url = new URL(provider.endpoint);
    if (url.protocol !== "https:") {
        throw new Error(`Provider endpoint must use HTTPS: ${provider.endpoint}`);
    }

    const start = Date.now();

    // Merge provider-level config (e.g. actorId for Apify) into params.
    // syncConfig keys are set by provider admin and never exposed to callers.
    const mergedParams = provider.syncConfig
        ? { ...params, ...provider.syncConfig }
        : params;

    let res: Response;
    try {
        res = await fetch(provider.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Use per-provider secret if set; otherwise fall back to caller's auth header.
                // Never forward caller's API key to untrusted providers — add providerSecret
                // when onboarding each external provider.
                "Authorization": provider.secret ? `Bearer ${provider.secret}` : authHeader,
            },
            body: JSON.stringify(mergedParams),
            // 10s timeout — Vercel function limit is 10s on hobby, 30s on pro
            signal: AbortSignal.timeout(10_000),
        });
    } catch (err) {
        const latencyMs = Date.now() - start;
        const isTimeout =
            err instanceof Error &&
            (err.name === "TimeoutError" || err.name === "AbortError");
        const errorType: ErrorType = isTimeout ? "timeout" : "network_error";
        return { success: false, data: { error: String(err) }, latencyMs, errorType };
    }

    const latencyMs = Date.now() - start;

    // Response body cap: 512KB for third-party providers, 1MB for internal
    const responseCap = isThirdParty ? 524_288 : 1_048_576;
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > responseCap) {
        throw new Error(`Provider response exceeds ${isThirdParty ? "512KB" : "1MB"} limit`);
    }

    const text = await res.text();
    if (text.length > responseCap) {
        throw new Error(`Provider response exceeds ${isThirdParty ? "512KB" : "1MB"} limit`);
    }

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }

    const errorType: ErrorType = res.ok
        ? "success"
        : res.status >= 500
        ? "error_5xx"
        : "error_4xx";

    return { success: res.ok, data, latencyMs, errorType };
}

// ── updateProviderStats ───────────────────────────────────────────────────────

/**
 * EMA update for avgLatencyMs, retryRate, and timeoutRate.
 * alpha=0.2: new value = 0.2 * observed + 0.8 * existing
 * Fire-and-forget — do NOT await before sending response.
 */
export async function updateProviderStats(
    providerId: number,
    latencyMs: number,
    success: boolean,
    isTimeout = false,
): Promise<void> {
    const ALPHA = 0.2;
    try {
        await prisma.$executeRawUnsafe(
            `UPDATE "Provider"
             SET
               "avgLatencyMs" = ROUND($1 * $2 + (1 - $1) * COALESCE("avgLatencyMs", 500)),
               "retryRate"    = $1 * $3 + (1 - $1) * COALESCE("retryRate", 0),
               "timeoutRate"  = $1 * $4 + (1 - $1) * COALESCE("timeoutRate", 0)
             WHERE id = $5`,
            ALPHA,
            latencyMs,
            success ? 0 : 1,
            isTimeout ? 1 : 0,
            providerId,
        );
    } catch (err) {
        console.error("[updateProviderStats] failed:", err);
    }
}

// ── createSkillRevenue ────────────────────────────────────────────────────────

/**
 * Write a SkillRevenue record for a successful third-party skill call.
 * On DB failure, emits a structured log for manual reconciliation — never silently drops.
 * Fire-and-forget: do NOT await before sending response.
 */
export async function createSkillRevenue(data: {
    skillId: number;
    publisherId: string;
    skillCallId: number;
    grossUSD: number;
    revenueShare: number;
}): Promise<void> {
    const publisherEarningUSD = data.grossUSD * data.revenueShare;
    try {
        await prisma.$executeRawUnsafe(
            `INSERT INTO "SkillRevenue" (id, "skillId", "publisherId", "skillCallId", "grossUSD", "revenueShare", "publisherEarningUSD", "paidOut", "createdAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, false, NOW())
             ON CONFLICT ("skillCallId") DO NOTHING`,
            data.skillId,
            data.publisherId,
            data.skillCallId,
            data.grossUSD,
            data.revenueShare,
            publisherEarningUSD,
        );
    } catch (err) {
        // Structured log for reconciliation — never silently drop revenue records
        console.error("[createSkillRevenue] DB write failed — reconciliation needed:", {
            skillId: data.skillId,
            publisherId: data.publisherId,
            skillCallId: data.skillCallId,
            grossUSD: data.grossUSD,
            publisherEarningUSD,
            error: String(err),
        });
    }
}

export async function recordSkillCall(data: {
    sessionId: string;
    newApiUserId: number;
    skillId: number;
    providerId: number;
    isRetry?: boolean;
    retryAttempt?: number;
    latencyMs?: number;
    success?: boolean;
    costUSD?: number;
    paramsHash?: string;
    errorType?: string;
}): Promise<number> {
    const row = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "SkillCall" ("sessionId", "newApiUserId", "skillId", "providerId", "isRetry", "retryAttempt", "latencyMs", "success", "costUSD", "paramsHash", "errorType", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING id`,
        data.sessionId,
        data.newApiUserId,
        data.skillId,
        data.providerId,
        data.isRetry ?? false,
        data.retryAttempt ?? 1,
        data.latencyMs ?? null,
        data.success ?? null,
        data.costUSD ?? null,
        data.paramsHash ?? null,
        data.errorType ?? null,
    );
    return row[0].id;
}
