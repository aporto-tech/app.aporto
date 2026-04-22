/**
 * GET /api/publisher/status
 * Returns publisher status + unpaid earnings for the sidebar badge.
 * Session auth only — does not require a publisher API key.
 * Intentionally narrow: strips stripeAccountId and other sensitive fields.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await prisma.$queryRawUnsafe<{
        status: string; total_unpaid: number;
    }[]>(
        `SELECT p.status,
                COALESCE(SUM(sr."publisherEarningUSD"), 0)::float AS total_unpaid
         FROM "Publisher" p
         JOIN "User" u ON u.id = p."userId"
         LEFT JOIN "SkillRevenue" sr ON sr."publisherId" = p.id AND sr."paidOut" = false
         WHERE u.email = $1
         GROUP BY p.status
         LIMIT 1`,
        session.user.email,
    );

    if (rows.length === 0) {
        return NextResponse.json({ status: "none", totalUnpaidUSD: 0 });
    }

    return NextResponse.json({
        status: rows[0].status,
        totalUnpaidUSD: Number(rows[0].total_unpaid),
    });
}
