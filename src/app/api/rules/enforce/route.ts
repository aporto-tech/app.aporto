import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { newApiGetTodayTokenSpend, newApiSetTokenStatus } from "@/lib/newapi";

export const dynamic = "force-dynamic";

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || !(session.user as any).newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }
        const newApiUserId = Number((session.user as any).newApiUserId);

        const dailyRules = await prisma.rule.findMany({
            where: { newApiUserId, type: "daily_limit", enabled: true },
        });

        const enforced = await Promise.all(
            dailyRules.map(async (rule) => {
                if (rule.limitUSD == null) return null;
                const spentUSD = await newApiGetTodayTokenSpend(rule.tokenId);
                const shouldDisable = spentUSD >= rule.limitUSD;
                await newApiSetTokenStatus(rule.tokenId, newApiUserId, shouldDisable ? 0 : 1);
                return { tokenId: rule.tokenId, spentUSD, limitUSD: rule.limitUSD, disabled: shouldDisable };
            })
        );

        return NextResponse.json({ success: true, enforced: enforced.filter(Boolean) });
    } catch (error) {
        console.error("[rules/enforce] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
