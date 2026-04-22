import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { validateApiKeyOrSession } from "@/lib/serviceProxy";
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

    const resolvedSessionId = sessionId ?? `rest-${auth.newApiUserId}-${Date.now()}`;
    const authHeader = req.headers.get("authorization") ?? "";

    // Compute params hash for retry detection and provider exclusion
    const paramsHash = computeParamsHash(skillId, params as Record<string, unknown>);

    // Detect if this is a retry (same user + same params within 2 minutes)
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

        const { success, data, latencyMs, errorType } = await executeSkillViaProvider(provider, params, authHeader);

        void recordSkillCall({
            sessionId: resolvedSessionId,
            newApiUserId: auth.newApiUserId,
            skillId,
            providerId: provider.id,
            isRetry,
            latencyMs,
            success,
            costUSD: provider.pricePerCall,
            paramsHash,
            errorType,
        }).catch((e) => console.error("[routing/execute] recordSkillCall:", e));

        void updateProviderStats(provider.id, latencyMs, success, errorType === "timeout")
            .catch((e) => console.error("[routing/execute] updateProviderStats:", e));

        return NextResponse.json({
            success,
            provider: provider.name,
            latencyMs,
            costUSD: provider.pricePerCall,
            result: data,
        }, { status: success ? 200 : 502 });
    } catch (err) {
        console.error("[routing/execute] error:", err);
        // Distinguish HTTPS/network errors (provider unreachable) from unexpected server errors
        const isNetworkError =
            err instanceof Error &&
            (err.message.includes("HTTPS") || err.message.includes("fetch"));
        return NextResponse.json(
            { success: false, message: String(err) },
            { status: isNetworkError ? 503 : 500 },
        );
    }
}
