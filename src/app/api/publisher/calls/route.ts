/**
 * GET /api/publisher/calls?skillId=N&limit=50&cursor=
 * Per-call audit log for publisher.
 */
import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError, pubError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { searchParams } = new URL(req.url);
    const skillId = Number(searchParams.get("skillId"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50")));
    const cursor = Number(searchParams.get("cursor") ?? "0"); // last seen SkillCall.id for pagination

    if (!skillId) return pubError("MISSING_PARAM", "skillId query parameter is required.", 400);

    // Verify ownership
    const owned = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `SELECT id FROM "Skill" WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        skillId, publisherId,
    );
    if (owned.length === 0) return pubError("NOT_FOUND", "Skill not found.", 404);

    const calls = await prisma.$queryRawUnsafe<{
        id: number; created_at: string; success: boolean | null;
        latency_ms: number | null; cost_usd: number | null;
        params_hash: string | null; error_type: string | null;
        earned_usd: number | null;
    }[]>(
        `SELECT c.id, c."createdAt" AS created_at, c.success, c."latencyMs" AS latency_ms,
                c."costUSD" AS cost_usd, c."paramsHash" AS params_hash, c."errorType" AS error_type,
                r."publisherEarningUSD" AS earned_usd
         FROM "SkillCall" c
         LEFT JOIN "SkillRevenue" r ON r."skillCallId" = c.id
         WHERE c."skillId" = $1
           AND ($3 = 0 OR c.id < $3)
         ORDER BY c.id DESC
         LIMIT $2`,
        skillId, limit, cursor,
    );

    const nextCursor = calls.length === limit ? calls[calls.length - 1].id : null;

    return NextResponse.json({
        success: true,
        calls: calls.map(c => ({
            id: c.id,
            createdAt: c.created_at,
            success: c.success,
            latencyMs: c.latency_ms,
            costUSD: c.cost_usd,
            paramsHash: c.params_hash,
            errorType: c.error_type,
            earnedUSD: c.earned_usd,
        })),
        nextCursor,
    });
}
