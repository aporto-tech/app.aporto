import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { validateApiKeyOrSession, deductUserQuota, logServiceUsage } from "@/lib/serviceProxy";
import {
    MAX_PROVIDER_ATTEMPTS,
    createSkillRevenue,
    deactivateSkillIfNoActiveProviders,
    executeSkillViaProvider,
    recordSkillCall,
    selectProvider,
    updateProviderStats,
} from "@/lib/routing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// Note: uses Node.js crypto — this route must NOT be configured as Edge runtime

function computeParamsHash(skillId: number, params: Record<string, unknown>): string {
    const canonical = JSON.stringify(params, (_, v: unknown) => {
        if (typeof v !== "object" || v === null || Array.isArray(v)) return v;
        return Object.fromEntries(
            Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
        );
    });
    return createHash("sha256").update(`${skillId}:${canonical}`).digest("hex");
}

const QUOTA_PER_DOLLAR = 500_000;

export async function POST(req: NextRequest) {
    const auth = await validateApiKeyOrSession(req);
    if (!auth) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { skillId, params = {}, sessionId } = body;

    if (!skillId || typeof skillId !== "number") {
        return NextResponse.json({ success: false, message: "Missing required field: skillId (number)" }, { status: 400 });
    }

    if (params !== null && (typeof params !== "object" || Array.isArray(params))) {
        return NextResponse.json({ success: false, message: "params must be a JSON object" }, { status: 400 });
    }

    // Auto-generate a stable per-user-per-day session when caller omits sessionId.
    // Using {userId}-{date} ensures the 24h provider diversity window activates for all callers.
    const today = new Date().toISOString().slice(0, 10);
    const resolvedSessionId = sessionId ?? `rest-${auth.newApiUserId}-${today}`;
    const authHeader = req.headers.get("authorization") ?? "";

    const paramsHash = computeParamsHash(skillId, params as Record<string, unknown>);

    // Look up skill publisherId for third-party guard
    const skillRows = await prisma.$queryRawUnsafe<{ publisherId: string | null; revenueShare: number | null }[]>(
        `SELECT s."publisherId", p."revenueShare"
         FROM "Skill" s
         LEFT JOIN "Publisher" p ON p.id = s."publisherId"
         WHERE s.id = $1 LIMIT 1`,
        skillId,
    );
    if (skillRows.length === 0) {
        return NextResponse.json({ success: false, message: "Skill not found." }, { status: 404 });
    }
    const publisherId = skillRows[0].publisherId ?? null;
    const revenueShare = skillRows[0].revenueShare != null ? Number(skillRows[0].revenueShare) : null;
    const isThirdParty = publisherId !== null;

    // Detect retry (same user + same params within 2 minutes)
    let isRetry = false;
    try {
        const existing = await prisma.$queryRawUnsafe<{ id: number }[]>(
            `SELECT id FROM "SkillCall"
             WHERE "newApiUserId" = $1
               AND "paramsHash" = $2
               AND "createdAt" > NOW() - INTERVAL '2 minutes'
             LIMIT 1`,
            auth.newApiUserId,
            paramsHash,
        );
        isRetry = existing.length > 0;
    } catch (e) {
        console.error("[routing/execute] isRetry check failed:", e);
    }

    try {
        const attemptedProviderIds: number[] = [];
        let lastFailure: { provider: string; latencyMs: number; errorType: string; result: unknown } | null = null;

        for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt++) {
            const provider = await selectProvider(
                skillId,
                resolvedSessionId,
                auth.newApiUserId,
                paramsHash,
                isThirdParty,
                attemptedProviderIds,
            );

            if (!provider) {
                const deactivated = await deactivateSkillIfNoActiveProviders(skillId);
                const msg = isThirdParty
                    ? "No active providers available for this skill. The skill provider may be misconfigured."
                    : "No active providers for this skill";
                return NextResponse.json({
                    success: false,
                    message: lastFailure ? "All provider attempts failed; no alternate providers remain." : msg,
                    attempts: attemptedProviderIds.length,
                    deactivated,
                    lastFailure,
                }, { status: lastFailure ? 502 : 503 });
            }

            attemptedProviderIds.push(provider.id);

            // For variable-cost providers (e.g. TTS), calculate actual cost from params.text.
            // Falls back to pricePerCall for fixed-cost providers.
            const textLen = typeof (params as Record<string, unknown>).text === "string"
                ? ((params as Record<string, unknown>).text as string).length
                : 0;
            const actualCost =
                provider.costPerChar != null && textLen > 0
                    ? Math.max(0.0001, textLen * provider.costPerChar)
                    : provider.pricePerCall;

            // Deduct balance before calling provider — returns 402 if insufficient
            const balanceError = await deductUserQuota(auth.newApiUserId, actualCost);
            if (balanceError) return balanceError;

            const { success, data, latencyMs, errorType } = await executeSkillViaProvider(provider, params, authHeader, isThirdParty);

            // Refund if provider failed
            if (!success) {
                void prisma.$executeRawUnsafe(
                    `UPDATE users SET quota = quota + $1, used_quota = used_quota - $1 WHERE id = $2`,
                    Math.ceil(actualCost * QUOTA_PER_DOLLAR),
                    auth.newApiUserId,
                ).catch((e) => console.error("[routing/execute] refund failed:", e));
            }

            const skillCallId = await recordSkillCall({
                sessionId: resolvedSessionId,
                newApiUserId: auth.newApiUserId,
                skillId,
                providerId: provider.id,
                isRetry: isRetry || attempt > 1,
                retryAttempt: attempt,
                latencyMs,
                success,
                costUSD: success ? actualCost : 0,
                paramsHash,
                errorType,
            });

            // Write revenue record for third-party skill calls
            if (success && isThirdParty && publisherId && revenueShare != null && actualCost > 0) {
                void createSkillRevenue({
                    skillId,
                    publisherId,
                    skillCallId,
                    grossUSD: actualCost,
                    revenueShare,
                }).catch(() => {/* error already logged inside createSkillRevenue */});
            }

            void updateProviderStats(provider.id, latencyMs, success, errorType === "timeout")
                .catch((e) => console.error("[routing/execute] updateProviderStats:", e));

            void logServiceUsage(auth.newApiUserId, "skill", provider.name, success ? actualCost : 0, { skillId, latencyMs, errorType, attempt })
                .catch((e) => console.error("[routing/execute] logServiceUsage:", e));

            if (success) {
                return NextResponse.json({
                    success,
                    provider: provider.name,
                    latencyMs,
                    costUSD: actualCost,
                    errorType,
                    attempts: attempt,
                    result: data,
                }, { status: 200 });
            }

            lastFailure = { provider: provider.name, latencyMs, errorType, result: data };

            if (errorType === "error_4xx") {
                break;
            }
        }

        return NextResponse.json({
            success: false,
            message: "All provider attempts failed.",
            attempts: attemptedProviderIds.length,
            costUSD: 0,
            lastFailure,
        }, { status: 502 });
    } catch (err) {
        console.error("[routing/execute] error:", err);
        const isNetworkError =
            err instanceof Error &&
            (err.message.includes("HTTPS") || err.message.includes("fetch"));
        return NextResponse.json(
            { success: false, message: String(err) },
            { status: isNetworkError ? 503 : 500 },
        );
    }
}
