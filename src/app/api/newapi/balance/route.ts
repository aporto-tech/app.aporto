import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const dynamic = "force-dynamic"; // Do not statically cache this route

/**
 * GET /api/newapi/balance
 *
 * Fetches the current user's quota (balance) from New-API.
 * Returns: { success: boolean, quota?: number, usedQuota?: number, message?: string }
 *
 * New-API quota is stored in "tokens" (1 token = $0.000001 / 0.000001 USD).
 * We convert to dollars: quota / 500000 = USD
 */
export async function GET(req: NextRequest) {
    try {
        const newApiUrl = process.env.NEWAPI_URL;
        const adminToken = process.env.NEWAPI_ADMIN_TOKEN;

        if (!newApiUrl || !adminToken || adminToken === "changeme_after_first_boot") {
            return NextResponse.json(
                { success: false, message: "New-API not configured" },
                { status: 500 }
            );
        }

        const session = await getServerSession(authOptions);
        // Fallback to "1" (admin) only if no user is logged in, though typically this route is protected
        const newApiUserId = (session?.user as any)?.newApiUserId || "1";

        // Fetch specific user info to get quota
        // We MUST pass "New-Api-User: 1" because the admin token belongs to user 1.
        // We cannot pass New-Api-User: 2 with user 1's token.
        const res = await fetch(`${newApiUrl}/api/user/${newApiUserId}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${adminToken}`,
                "New-Api-User": "1",
            },
            cache: "no-store", // Do not cache the fetch result
        });

        if (!res.ok) {
            return NextResponse.json(
                { success: false, message: `New-API error: ${res.status}` },
                { status: res.status }
            );
        }

        const data = await res.json() as {
            success: boolean;
            message?: string;
            data?: {
                quota: number;
                used_quota: number;
                username: string;
                email: string;
            };
        };

        if (!data.success || !data.data) {
            return NextResponse.json(
                { success: false, message: data.message ?? "Failed to fetch balance" },
                { status: 500 }
            );
        }

        // New-API stores quota in "credits" where 500000 = $1 USD
        const QUOTA_PER_DOLLAR = 500000;
        const quota = data.data.quota;
        const usedQuota = data.data.used_quota;
        const remainingUSD = quota / QUOTA_PER_DOLLAR;
        const usedUSD = usedQuota / QUOTA_PER_DOLLAR;

        return NextResponse.json({
            success: true,
            quota,
            usedQuota,
            remainingUSD: Math.max(0, remainingUSD),
            usedUSD,
            username: data.data.username,
        });
    } catch (error) {
        console.error("[balance] Error:", error);
        return NextResponse.json(
            { success: false, message: String(error) },
            { status: 500 }
        );
    }
}
