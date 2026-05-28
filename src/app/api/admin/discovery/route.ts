import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50") || 50));
    const offset = Math.max(0, Number(searchParams.get("offset") ?? "0") || 0);
    const source = searchParams.get("source") || "all";
    const noResults = searchParams.get("noResults");
    const query = searchParams.get("query")?.trim();
    const userId = Number(searchParams.get("userId") ?? "0") || null;

    const where: string[] = [];
    const params: unknown[] = [];
    let p = 0;

    if (source !== "all") {
        p += 1;
        where.push(`d.source = $${p}`);
        params.push(source);
    }
    if (noResults === "true") {
        where.push(`d."noResults" = true`);
    } else if (noResults === "false") {
        where.push(`d."noResults" = false`);
    }
    if (query) {
        p += 1;
        where.push(`d.query ILIKE $${p}`);
        params.push(`%${query}%`);
    }
    if (userId) {
        p += 1;
        where.push(`d."newApiUserId" = $${p}`);
        params.push(userId);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [countRow] = await prisma.$queryRawUnsafe<{ total: number }[]>(
        `SELECT COUNT(*)::int AS total FROM "SkillDiscoveryLog" d ${whereSql}`,
        ...params,
    );

    const rows = await prisma.$queryRawUnsafe<{
        id: string;
        created_at: string;
        source: string;
        query: string;
        normalized: string;
        result_count: number;
        top_skill_ids: string | null;
        top_similarity: number | null;
        no_results: boolean;
        latency_ms: number | null;
        session_id: string | null;
        new_api_user_id: number;
        error: string | null;
    }[]>(
        `SELECT
            d.id,
            d."createdAt"::text AS created_at,
            d.source,
            d.query,
            d.normalized,
            d."resultCount" AS result_count,
            d."topSkillIds" AS top_skill_ids,
            d."topSimilarity" AS top_similarity,
            d."noResults" AS no_results,
            d."latencyMs" AS latency_ms,
            d."sessionId" AS session_id,
            d."newApiUserId" AS new_api_user_id,
            d.error
         FROM "SkillDiscoveryLog" d
         ${whereSql}
         ORDER BY d."createdAt" DESC
         LIMIT $${p + 1} OFFSET $${p + 2}`,
        ...params,
        limit,
        offset,
    );

    return NextResponse.json({
        success: true,
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
        rows,
    });
}
