/**
 * GET /api/publisher/account
 * Publisher account info: revenueShare, status, unpaid balance, submissions quota.
 */
import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId, publisher } = authResult.auth;

    const [accountRows, unpaidRows, submissionsRows] = await Promise.all([
        prisma.$queryRawUnsafe<{
            display_name: string; website: string | null; description: string | null;
            status: string; revenue_share: number; stripe_account_id: string | null;
            approved_at: string | null; created_at: string;
        }[]>(
            `SELECT "displayName" AS display_name, website, description, status,
                    "revenueShare" AS revenue_share, "stripeAccountId" AS stripe_account_id,
                    "approvedAt" AS approved_at, "createdAt" AS created_at
             FROM "Publisher" WHERE id = $1 LIMIT 1`,
            publisherId,
        ),
        prisma.$queryRawUnsafe<{ total: number }[]>(
            `SELECT COALESCE(SUM("publisherEarningUSD"), 0)::float AS total
             FROM "SkillRevenue" WHERE "publisherId" = $1 AND "paidOut" = false`,
            publisherId,
        ),
        prisma.$queryRawUnsafe<{ cnt: number }[]>(
            `SELECT COUNT(*)::int AS cnt FROM "Skill" WHERE "publisherId" = $1 AND status = 'pending_review'`,
            publisherId,
        ),
    ]);

    const account = accountRows[0];
    const totalUnpaidUSD = Number(unpaidRows[0]?.total ?? 0);
    const submissionsUsed = submissionsRows[0]?.cnt ?? 0;

    return NextResponse.json({
        success: true,
        account: {
            publisherId,
            displayName: account.display_name,
            website: account.website,
            description: account.description,
            status: account.status,
            revenueShare: Number(account.revenue_share),
            revenueSharePercent: `${Math.round(Number(account.revenue_share) * 100)}%`,
            stripeAccountId: account.stripe_account_id,
            approvedAt: account.approved_at,
            createdAt: account.created_at,
        },
        earnings: {
            totalUnpaidUSD,
            note: "Payouts are processed manually. Contact support to request a payout.",
        },
        submissions: {
            used: submissionsUsed,
            remaining: Math.max(0, 10 - submissionsUsed),
            limit: 10,
        },
    });
}
