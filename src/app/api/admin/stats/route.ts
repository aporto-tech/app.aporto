import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const period = Math.min(30, Math.max(1, parseInt(searchParams.get("period") ?? "7", 10) || 7));

    // Overview
    const [overview] = await prisma.$queryRawUnsafe<{
        total_calls: number;
        success_calls: number;
        avg_latency_ms: number;
        retry_calls: number;
        success_count: number;
        timeout_count: number;
        error_5xx_count: number;
        error_4xx_count: number;
        network_error_count: number;
    }[]>(
        `SELECT
            COUNT(*)::int                                                                  AS total_calls,
            COUNT(*) FILTER (WHERE success = true)::int                                   AS success_calls,
            COALESCE(AVG("latencyMs") FILTER (WHERE "latencyMs" IS NOT NULL), 0)::int     AS avg_latency_ms,
            COUNT(*) FILTER (WHERE "isRetry" = true)::int                                 AS retry_calls,
            COUNT(*) FILTER (WHERE "errorType" = 'success' OR (success = true AND "errorType" IS NULL))::int  AS success_count,
            COUNT(*) FILTER (WHERE "errorType" = 'timeout')::int                          AS timeout_count,
            COUNT(*) FILTER (WHERE "errorType" = 'error_5xx')::int                        AS error_5xx_count,
            COUNT(*) FILTER (WHERE "errorType" = 'error_4xx')::int                        AS error_4xx_count,
            COUNT(*) FILTER (WHERE "errorType" = 'network_error')::int                    AS network_error_count
         FROM "SkillCall"
         WHERE "createdAt" > NOW() - INTERVAL '1 day' * $1`,
        period,
    );

    // Top skills
    const topSkills = await prisma.$queryRawUnsafe<{
        id: number;
        name: string;
        calls: number;
        success_calls: number;
        avg_latency_ms: number;
    }[]>(
        `SELECT
            s.id,
            s.name,
            COUNT(sc.id)::int                                                              AS calls,
            COUNT(sc.id) FILTER (WHERE sc.success = true)::int                            AS success_calls,
            COALESCE(AVG(sc."latencyMs") FILTER (WHERE sc."latencyMs" IS NOT NULL), 0)::int AS avg_latency_ms
         FROM "Skill" s
         JOIN "SkillCall" sc ON sc."skillId" = s.id
         WHERE sc."createdAt" > NOW() - ($1 || ' days')::interval
         GROUP BY s.id, s.name
         ORDER BY calls DESC
         LIMIT 10`,
        period,
    );

    // Provider stats
    const providers = await prisma.$queryRawUnsafe<{
        id: number;
        name: string;
        skill_name: string;
        calls: number;
        success_calls: number;
        avg_latency_ms: number;
        retry_rate: number;
        timeout_rate: number;
    }[]>(
        `SELECT
            p.id,
            p.name,
            s.name                                                                         AS skill_name,
            COUNT(sc.id)::int                                                              AS calls,
            COUNT(sc.id) FILTER (WHERE sc.success = true)::int                            AS success_calls,
            COALESCE(AVG(sc."latencyMs") FILTER (WHERE sc."latencyMs" IS NOT NULL), 0)::int AS avg_latency_ms,
            p."retryRate"                                                                  AS retry_rate,
            p."timeoutRate"                                                                AS timeout_rate
         FROM "Provider" p
         JOIN "Skill" s ON s.id = p."skillId"
         LEFT JOIN "SkillCall" sc ON sc."providerId" = p.id
             AND sc."createdAt" > NOW() - ($1 || ' days')::interval
         GROUP BY p.id, p.name, s.name, p."retryRate", p."timeoutRate"
         ORDER BY calls DESC`,
        period,
    );

    // Daily volume
    const dailyVolume = await prisma.$queryRawUnsafe<{
        day: string;
        calls: number;
        success_calls: number;
    }[]>(
        `SELECT
            TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS day,
            COUNT(*)::int                                           AS calls,
            COUNT(*) FILTER (WHERE success = true)::int            AS success_calls
         FROM "SkillCall"
         WHERE "createdAt" > NOW() - ($1 || ' days')::interval
         GROUP BY DATE_TRUNC('day', "createdAt")
         ORDER BY day ASC`,
        period,
    );

    const totalCalls = Number(overview?.total_calls ?? 0);
    const successCalls = Number(overview?.success_calls ?? 0);

    return NextResponse.json({
        overview: {
            totalCalls,
            successRate: totalCalls > 0 ? successCalls / totalCalls : 0,
            avgLatencyMs: Number(overview?.avg_latency_ms ?? 0),
            retryRate: totalCalls > 0 ? Number(overview?.retry_calls ?? 0) / totalCalls : 0,
            errorBreakdown: {
                success: Number(overview?.success_count ?? 0),
                timeout: Number(overview?.timeout_count ?? 0),
                error_5xx: Number(overview?.error_5xx_count ?? 0),
                error_4xx: Number(overview?.error_4xx_count ?? 0),
                network_error: Number(overview?.network_error_count ?? 0),
            },
        },
        topSkills: topSkills.map((s) => ({
            id: s.id,
            name: s.name,
            calls: Number(s.calls),
            successRate: Number(s.calls) > 0 ? Number(s.success_calls) / Number(s.calls) : 0,
            avgLatencyMs: Number(s.avg_latency_ms),
        })),
        providers: providers.map((p) => ({
            id: p.id,
            name: p.name,
            skillName: p.skill_name,
            calls: Number(p.calls),
            successRate: Number(p.calls) > 0 ? Number(p.success_calls) / Number(p.calls) : 0,
            avgLatencyMs: Number(p.avg_latency_ms),
            retryRate: Number(p.retry_rate),
            timeoutRate: Number(p.timeout_rate),
        })),
        dailyVolume: dailyVolume.map((d) => ({
            day: d.day,
            calls: Number(d.calls),
            successCalls: Number(d.success_calls),
        })),
    });
}
