/**
 * GET  /api/admin/publisher-payouts — list publishers with unpaid balances
 * POST /api/admin/publisher-payouts — mark publisher's earnings as paid
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const payouts = await prisma.$queryRawUnsafe<{
        publisher_id: string; display_name: string; email: string;
        revenue_share: number; unpaid_usd: number; total_calls: number;
    }[]>(
        `SELECT p.id AS publisher_id, p."displayName" AS display_name, u.email,
                p."revenueShare" AS revenue_share,
                COALESCE(SUM(r."publisherEarningUSD"), 0)::float AS unpaid_usd,
                COUNT(r.id)::int AS total_calls
         FROM "Publisher" p
         JOIN "User" u ON u.id = p."userId"
         LEFT JOIN "SkillRevenue" r ON r."publisherId" = p.id AND r."paidOut" = false
         WHERE p.status = 'approved'
         GROUP BY p.id, p."displayName", u.email, p."revenueShare"
         HAVING COALESCE(SUM(r."publisherEarningUSD"), 0) > 0
         ORDER BY unpaid_usd DESC`
    );

    return NextResponse.json({ success: true, payouts });
}

export async function POST(req: NextRequest) {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { publisherId } = body;
    if (!publisherId) return NextResponse.json({ error: "publisherId required" }, { status: 400 });

    const result = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
        `UPDATE "SkillRevenue"
         SET "paidOut" = true, "paidOutAt" = NOW()
         WHERE "publisherId" = $1 AND "paidOut" = false
         RETURNING COUNT(*)::int AS cnt`,
        publisherId,
    );

    return NextResponse.json({ success: true, rowsUpdated: result[0]?.cnt ?? 0 });
}
