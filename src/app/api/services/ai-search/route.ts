import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession, deductUserQuota, logServiceUsage } from "@/lib/serviceProxy";

export const dynamic = "force-dynamic";

const YOUCOM_BASE = "https://api.ydc-index.io";
const COST_SEARCH = 0.005;
const COST_RESEARCH = 0.0065;

export async function POST(req: NextRequest) {
    try {
        const auth = await validateApiKeyOrSession(req);
        if (!auth) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { query, type = "search" } = body;

        if (!query) {
            return NextResponse.json({ success: false, message: "Missing required field: query" }, { status: 400 });
        }

        const costUSD = type === "research" ? COST_RESEARCH : COST_SEARCH;

        // Check balance and deduct
        const balanceError = await deductUserQuota(auth.newApiUserId, costUSD);
        if (balanceError) return balanceError;

        // Choose endpoint
        const endpoint = type === "research" ? "/rag" : "/search";
        const url = new URL(`${YOUCOM_BASE}${endpoint}`);
        url.searchParams.set("query", query);

        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "X-API-Key": process.env.YOUCOM_API_KEY ?? "",
            },
        });

        const data = await res.json();

        if (!res.ok) {
            await import("@/lib/prisma").then(({ prisma }) =>
                prisma.$executeRawUnsafe(
                    `UPDATE users SET quota = quota + $1, used_quota = used_quota - $1 WHERE id = $2`,
                    Math.ceil(costUSD * 500_000),
                    auth.newApiUserId
                )
            );
            return NextResponse.json(
                { success: false, message: data.message ?? "You.com error", detail: data },
                { status: res.status }
            );
        }

        await logServiceUsage(auth.newApiUserId, "ai-search", "youcom", costUSD, { query, type });

        return NextResponse.json({ success: true, ...data, costUSD });
    } catch (error) {
        console.error("[services/ai-search] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
