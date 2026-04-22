/**
 * GET  /api/admin/publishers          — list all publishers
 * POST /api/admin/publishers/[id]     — approve or suspend (handled in [id]/route.ts)
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const publishers = await prisma.$queryRawUnsafe<{
        id: string; display_name: string; website: string | null;
        status: string; revenue_share: number;
        email: string; approved_at: string | null; created_at: string;
        skill_count: number; live_skill_count: number;
        total_calls: number; unpaid_usd: number;
    }[]>(
        `SELECT p.id, p."displayName" AS display_name, p.website, p.status,
                p."revenueShare" AS revenue_share, p."approvedAt" AS approved_at, p."createdAt" AS created_at,
                u.email,
                (SELECT COUNT(*)::int FROM "Skill" s WHERE s."publisherId" = p.id) AS skill_count,
                (SELECT COUNT(*)::int FROM "Skill" s WHERE s."publisherId" = p.id AND s.status = 'live') AS live_skill_count,
                (SELECT COUNT(*)::int FROM "SkillCall" sc
                 JOIN "Skill" s ON s.id = sc."skillId" WHERE s."publisherId" = p.id) AS total_calls,
                (SELECT COALESCE(SUM(r."publisherEarningUSD"), 0)::float
                 FROM "SkillRevenue" r WHERE r."publisherId" = p.id AND r."paidOut" = false) AS unpaid_usd
         FROM "Publisher" p
         JOIN "User" u ON u.id = p."userId"
         ORDER BY p."createdAt" DESC`
    );

    return NextResponse.json({ success: true, publishers });
}
