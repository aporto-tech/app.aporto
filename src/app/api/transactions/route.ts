import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { newApiGetDailySpend } from "@/lib/newapi";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || !(session.user as any).newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const newApiUserId = Number((session.user as any).newApiUserId);

        const [topUps, dailySpend] = await Promise.all([
            prisma.topUpTransaction.findMany({
                where: { newApiUserId },
                orderBy: { createdAt: "desc" },
            }),
            newApiGetDailySpend(newApiUserId),
        ]);

        return NextResponse.json({ success: true, topUps, dailySpend });
    } catch (error) {
        console.error("[transactions] Error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
