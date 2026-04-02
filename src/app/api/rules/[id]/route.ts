import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { newApiUpdateTokenQuota, newApiSetTokenModels, newApiSetTokenStatus } from "@/lib/newapi";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await getServerSession(authOptions);
        if (!session?.user || !(session.user as any).newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }
        const newApiUserId = Number((session.user as any).newApiUserId);

        const rule = await prisma.rule.findFirst({
            where: { id, newApiUserId },
        });
        if (!rule) {
            return NextResponse.json({ success: false, message: "Rule not found" }, { status: 404 });
        }

        // Undo enforcement
        if (rule.type === "total_limit") {
            await newApiUpdateTokenQuota({
                tokenId: rule.tokenId,
                userId: newApiUserId,
                name: rule.tokenName,
                remain_quota: 0,
                unlimited_quota: true,
            });
        } else if (rule.type === "daily_limit") {
            await newApiSetTokenStatus(rule.tokenId, newApiUserId, 1); // re-enable
        } else if (rule.type === "model_allowlist") {
            await newApiSetTokenModels(rule.tokenId, newApiUserId, ""); // clear restriction
        }

        await prisma.rule.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[rules/[id]] DELETE error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
