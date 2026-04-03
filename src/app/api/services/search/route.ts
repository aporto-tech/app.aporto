import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession, deductUserQuota, logServiceUsage } from "@/lib/serviceProxy";

export const dynamic = "force-dynamic";

const LINKUP_BASE = "https://api.linkupapi.com/v1";
const COST_STANDARD = 0.006;
const COST_DEEP = 0.055;

export async function POST(req: NextRequest) {
    try {
        const auth = await validateApiKeyOrSession(req);
        if (!auth) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { query, depth = "standard", outputType = "sourcedAnswer" } = body;

        if (!query) {
            return NextResponse.json({ success: false, message: "Missing required field: query" }, { status: 400 });
        }

        const costUSD = depth === "deep" ? COST_DEEP : COST_STANDARD;

        // Check balance and deduct
        const balanceError = await deductUserQuota(auth.newApiUserId, costUSD);
        if (balanceError) return balanceError;

        // Call LinkUp search API
        const res = await fetch(`${LINKUP_BASE}/search`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.LINKUP_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ q: query, depth, outputType }),
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
                { success: false, message: data.message ?? "LinkUp error", detail: data },
                { status: res.status }
            );
        }

        await logServiceUsage(auth.newApiUserId, "search", "linkup", costUSD, { query, depth });

        return NextResponse.json({ success: true, ...data, costUSD });
    } catch (error) {
        console.error("[services/search] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
