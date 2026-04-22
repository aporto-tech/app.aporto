/**
 * Skill routing layer.
 *
 * discoverSkills    — semantic similarity search via pgvector, 5 per page
 * selectProvider    — score providers by price/latency/retryRate; exclude
 *                     providers already used by this (sessionId, userId) pair
 * executeSkillViaProvider — HTTP POST to provider.endpoint with 10s timeout
 * updateProviderStats     — fire-and-forget EMA update (alpha=0.2)
 */

import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embeddings";

const PAGE_SIZE = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveredSkill {
    id: number;
    name: string;
    description: string;
    paramsSchema: string | null;
    tags: string | null;
    similarity: number;
}

export interface ScoredProvider {
    id: number;
    name: string;
    endpoint: string;
    pricePerCall: number;
    avgLatencyMs: number;
    retryRate: number;
}

// ── discoverSkills ────────────────────────────────────────────────────────────

export async function discoverSkills(
    query: string,
    page = 0,
): Promise<DiscoveredSkill[]> {
    const embedding = await embedQuery(query);
    const vectorLiteral = `[${embedding.join(",")}]`;
    const offset = page * PAGE_SIZE;

    // pgvector cosine similarity: 1 - (embedding <=> query_vec)
    const rows = await prisma.$queryRawUnsafe<
        { id: number; name: string; description: string; params_schema: string | null; tags: string | null; similarity: number }[]
    >(
        `SELECT
            id,
            name,
            description,
            "paramsSchema" AS params_schema,
            tags,
            1 - (embedding <=> $1::vector) AS similarity
         FROM "Skill"
         WHERE "isActive" = true AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $2 OFFSET $3`,
        vectorLiteral,
        PAGE_SIZE,
        offset,
    );

    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
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
): Promise<ScoredProvider | null> {
    // Single CTE query: fetch active providers + exclude ones used in this session
    const rows = await prisma.$queryRawUnsafe<
        { id: number; name: string; endpoint: string; price_per_call: number; avg_latency_ms: number; retry_rate: number }[]
    >(
        `WITH used AS (
            SELECT DISTINCT "providerId"
            FROM "SkillCall"
            WHERE "sessionId" = $1
              AND "newApiUserId" = $2
              AND "skillId" = $3
              AND "createdAt" > NOW() - INTERVAL '24 hours'
        )
        SELECT
            p.id,
            p.name,
            p.endpoint,
            p."pricePerCall"  AS price_per_call,
            p."avgLatencyMs"  AS avg_latency_ms,
            p."retryRate"     AS retry_rate
        FROM "Provider" p
        WHERE p."skillId" = $3
          AND p."isActive" = true
          AND p.id NOT IN (SELECT "providerId" FROM used)
        ORDER BY p.id`,
        sessionId,
        newApiUserId,
        skillId,
    );

    if (rows.length === 0) return null;
    if (rows.length === 1) {
        const p = rows[0];
        return {
            id: p.id,
            name: p.name,
            endpoint: p.endpoint,
            pricePerCall: Number(p.price_per_call),
            avgLatencyMs: Number(p.avg_latency_ms),
            retryRate: Number(p.retry_rate),
        };
    }

    // Min-max normalize then score: 0.4*(1-normPrice) + 0.4*(1-normLatency) + 0.2*(1-retryRate)
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
            0.4 * (1 - normPrice) +
            0.4 * (1 - normLat) +
            0.2 * (1 - Number(r.retry_rate));
        return { ...r, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    return {
        id: best.id,
        name: best.name,
        endpoint: best.endpoint,
        pricePerCall: Number(best.price_per_call),
        avgLatencyMs: Number(best.avg_latency_ms),
        retryRate: Number(best.retry_rate),
    };
}

// ── executeSkillViaProvider ───────────────────────────────────────────────────

export async function executeSkillViaProvider(
    provider: ScoredProvider,
    params: Record<string, unknown>,
    authHeader: string,
): Promise<{ success: boolean; data: unknown; latencyMs: number }> {
    // HTTPS-only enforcement (SSRF guard — admin controls endpoint URL)
    const url = new URL(provider.endpoint);
    if (url.protocol !== "https:") {
        throw new Error(`Provider endpoint must use HTTPS: ${provider.endpoint}`);
    }

    const start = Date.now();

    const res = await fetch(provider.endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
        },
        body: JSON.stringify(params),
        // 10s timeout — Vercel function limit is 10s on hobby, 30s on pro
        signal: AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - start;

    // 1MB response body cap
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > 1_048_576) {
        throw new Error("Provider response exceeds 1MB limit");
    }

    const text = await res.text();
    if (text.length > 1_048_576) {
        throw new Error("Provider response exceeds 1MB limit");
    }

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }

    return { success: res.ok, data, latencyMs };
}

// ── updateProviderStats ───────────────────────────────────────────────────────

/**
 * EMA update for avgLatencyMs and retryRate.
 * alpha=0.2: new value = 0.2 * observed + 0.8 * existing
 * Fire-and-forget — do NOT await before sending response.
 */
export async function updateProviderStats(
    providerId: number,
    latencyMs: number,
    success: boolean,
): Promise<void> {
    const ALPHA = 0.2;
    try {
        await prisma.$executeRawUnsafe(
            `UPDATE "Provider"
             SET
               "avgLatencyMs" = ROUND($1 * $2 + (1 - $1) * "avgLatencyMs"),
               "retryRate"    = $1 * $3 + (1 - $1) * "retryRate"
             WHERE id = $4`,
            ALPHA,
            latencyMs,
            success ? 0 : 1,
            providerId,
        );
    } catch (err) {
        console.error("[updateProviderStats] failed:", err);
    }
}

// ── recordSkillCall ───────────────────────────────────────────────────────────

export async function recordSkillCall(data: {
    sessionId: string;
    newApiUserId: number;
    skillId: number;
    providerId: number;
    isRetry?: boolean;
    latencyMs?: number;
    success?: boolean;
    costUSD?: number;
}): Promise<number> {
    const row = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "SkillCall" ("sessionId", "newApiUserId", "skillId", "providerId", "isRetry", "latencyMs", "success", "costUSD", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id`,
        data.sessionId,
        data.newApiUserId,
        data.skillId,
        data.providerId,
        data.isRetry ?? false,
        data.latencyMs ?? null,
        data.success ?? null,
        data.costUSD ?? null,
    );
    return row[0].id;
}
