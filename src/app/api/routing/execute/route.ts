import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { validateApiKeyOrSession, deductUserQuota, logServiceUsage } from "@/lib/serviceProxy";
import { selectProvider, executeSkillViaProvider, updateProviderStats, recordSkillCall } from "@/lib/routing";
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
        const provider = await selectProvider(skillId, resolvedSessionId, auth.newApiUserId, paramsHash);
        if (!provider) {
            return NextResponse.json({ success: false, message: "No active providers for this skill" }, { status: 503 });
        }

        // Deduct balance before calling provider — returns 402 if insufficient
        const balanceError = await deductUserQuota(auth.newApiUserId, provider.pricePerCall);
        if (balanceError) return balanceError;

        const { success, data, latencyMs, errorType } = await executeSkillViaProvider(provider, params, authHeader);

        // Refund if provider failed
        if (!success) {
            void prisma.$executeRawUnsafe(
                `UPDATE users SET quota = quota + $1, used_quota = used_quota - $1 WHERE id = $2`,
                Math.ceil(provider.pricePerCall * QUOTA_PER_DOLLAR),
                auth.newApiUserId,
            ).catch((e) => console.error("[routing/execute] refund failed:", e));
        }

        void recordSkillCall({
            sessionId: resolvedSessionId,
            newApiUserId: auth.newApiUserId,
            skillId,
            providerId: provider.id,
            isRetry,
            latencyMs,
            success,
            costUSD: success ? provider.pricePerCall : 0,
            paramsHash,
            errorType,
        }).catch((e) => console.error("[routing/execute] recordSkillCall:", e));

        void updateProviderStats(provider.id, latencyMs, success, errorType === "timeout")
            .catch((e) => console.error("[routing/execute] updateProviderStats:", e));

        void logServiceUsage(auth.newApiUserId, "skill", provider.name, success ? provider.pricePerCall : 0, { skillId, latencyMs, errorType })
            .catch((e) => console.error("[routing/execute] logServiceUsage:", e));

        return NextResponse.json({
            success,
            provider: provider.name,
            latencyMs,
            costUSD: success ? provider.pricePerCall : 0,
            errorType,
            result: data,
        }, { status: success ? 200 : 502 });
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
