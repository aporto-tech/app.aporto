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

// ── discoverSkills ────────────────────────────────────────────────────────────

export async function discoverSkills(
    query: string,
    page = 0,
    filters?: { category?: string; capability?: string },
): Promise<DiscoveredSkill[]> {
    const embedding = await embedQuery(query);
    const vectorLiteral = `[${embedding.join(",")}]`;
    const offset = page * PAGE_SIZE;

    const conditions: string[] = [`"isActive" = true`, `embedding IS NOT NULL`, `status = 'live'`];
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
): Promise<ScoredProvider | null> {
    // Unified CTE: exclude providers used in this session (24h) OR same paramsHash (2 min)
    // For third-party skills: also exclude providers without a providerSecret (T1 guard)
    const rows = await prisma.$queryRawUnsafe<
        { id: number; name: string; endpoint: string; price_per_call: number; cost_per_char: number | null; avg_latency_ms: number; retry_rate: number; timeout_rate: number; secret: string | null; sync_config: string | null }[]
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
        ORDER BY p.id`,
        sessionId,
        newApiUserId,
        skillId,
        paramsHash ?? null,
        isThirdParty,
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
    return {
        id: best.id,
        name: best.name,
        endpoint: best.endpoint,
        pricePerCall: Number(best.price_per_call),
        costPerChar: best.cost_per_char != null ? Number(best.cost_per_char) : null,
        avgLatencyMs: Number(best.avg_latency_ms),
        retryRate: Number(best.retry_rate),
        timeoutRate: Number(best.timeout_rate),
        secret: best.secret ?? null,
        syncConfig: best.sync_config ? JSON.parse(best.sync_config) : null,
    };
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
    latencyMs?: number;
    success?: boolean;
    costUSD?: number;
    paramsHash?: string;
    errorType?: string;
}): Promise<number> {
    const row = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "SkillCall" ("sessionId", "newApiUserId", "skillId", "providerId", "isRetry", "latencyMs", "success", "costUSD", "paramsHash", "errorType", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING id`,
        data.sessionId,
        data.newApiUserId,
        data.skillId,
        data.providerId,
        data.isRetry ?? false,
        data.latencyMs ?? null,
        data.success ?? null,
        data.costUSD ?? null,
        data.paramsHash ?? null,
        data.errorType ?? null,
    );
    return row[0].id;
}
