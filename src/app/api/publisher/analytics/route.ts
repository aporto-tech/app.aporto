/**
 * GET /api/publisher/analytics?skillId=N&period=7
 * Per-skill analytics: calls, revenue, success rate, avg latency, error breakdown.
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
    const period = Math.min(30, Math.max(1, Number(searchParams.get("period") ?? "7")));

    if (!skillId) return pubError("MISSING_PARAM", "skillId query parameter is required.", 400);

    // Verify ownership
    const owned = await prisma.$queryRawUnsafe<{ id: number; name: string }[]>(
        `SELECT id, name FROM "Skill" WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        skillId, publisherId,
    );
    if (owned.length === 0) return pubError("NOT_FOUND", "Skill not found.", 404);

    const [statsRows, errorRows, dailyRows, revenueRows] = await Promise.all([
        prisma.$queryRawUnsafe<{
            total_calls: number; success_calls: number; avg_latency_ms: number;
        }[]>(
            `SELECT COUNT(*)::int AS total_calls,
                    SUM(CASE WHEN success = true THEN 1 ELSE 0 END)::int AS success_calls,
                    ROUND(AVG(COALESCE("latencyMs", 0)))::int AS avg_latency_ms
             FROM "SkillCall"
             WHERE "skillId" = $1 AND "createdAt" > NOW() - ($2 || ' days')::interval`,
            skillId, period,
        ),
        prisma.$queryRawUnsafe<{ error_type: string | null; cnt: number }[]>(
            `SELECT COALESCE("errorType", 'success') AS error_type, COUNT(*)::int AS cnt
             FROM "SkillCall"
             WHERE "skillId" = $1 AND "createdAt" > NOW() - ($2 || ' days')::interval
             GROUP BY COALESCE("errorType", 'success')`,
            skillId, period,
        ),
        prisma.$queryRawUnsafe<{ day: string; calls: number; success_calls: number }[]>(
            `SELECT TO_CHAR("createdAt"::date, 'YYYY-MM-DD') AS day,
                    COUNT(*)::int AS calls,
                    SUM(CASE WHEN success = true THEN 1 ELSE 0 END)::int AS success_calls
             FROM "SkillCall"
             WHERE "skillId" = $1 AND "createdAt" > NOW() - ($2 || ' days')::interval
             GROUP BY "createdAt"::date ORDER BY "createdAt"::date ASC`,
            skillId, period,
        ),
        prisma.$queryRawUnsafe<{ total_gross: number; total_earned: number }[]>(
            `SELECT COALESCE(SUM("grossUSD"), 0)::float AS total_gross,
                    COALESCE(SUM("publisherEarningUSD"), 0)::float AS total_earned
             FROM "SkillRevenue"
             WHERE "skillId" = $1 AND "createdAt" > NOW() - ($2 || ' days')::interval`,
            skillId, period,
        ),
    ]);

    const stats = statsRows[0];
    const errorBreakdown: Record<string, number> = {};
    for (const row of errorRows) errorBreakdown[row.error_type ?? "success"] = row.cnt;

    return NextResponse.json({
        success: true,
        skillId,
        skillName: owned[0].name,
        period,
        calls: stats.total_calls ?? 0,
        successRate: stats.total_calls > 0 ? (stats.success_calls ?? 0) / stats.total_calls : 0,
        avgLatencyMs: stats.avg_latency_ms ?? 0,
        errorBreakdown,
        revenue: {
            grossUSD: Number(revenueRows[0]?.total_gross ?? 0),
            earnedUSD: Number(revenueRows[0]?.total_earned ?? 0),
        },
        dailyVolume: dailyRows,
    });
}
