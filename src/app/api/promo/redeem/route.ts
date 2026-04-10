import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { safeTopUp } from "@/lib/topup";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        const newApiUserId = (session?.user as any)?.newApiUserId;

        if (!userId || !newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const code = (body.code ?? "").trim().toUpperCase();

        if (!code) {
            return NextResponse.json({ success: false, message: "Promo code is required." }, { status: 400 });
        }

        const promo = await prisma.promoCode.findUnique({ where: { code } });

        if (!promo) {
            return NextResponse.json({ success: false, message: "Invalid promo code." }, { status: 404 });
        }

        if (promo.expiresAt && promo.expiresAt < new Date()) {
            return NextResponse.json({ success: false, message: "This promo code has expired." }, { status: 400 });
        }

        if (promo.usedCount >= promo.maxUses) {
            return NextResponse.json({ success: false, message: "This promo code has already been fully redeemed." }, { status: 400 });
        }

        const existing = await prisma.promoRedemption.findUnique({
            where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
        });
        if (existing) {
            return NextResponse.json({ success: false, message: "You have already redeemed this promo code." }, { status: 400 });
        }

        // Create redemption + increment counter atomically
        await prisma.$transaction([
            prisma.promoRedemption.create({ data: { promoCodeId: promo.id, userId } }),
            prisma.promoCode.update({ where: { id: promo.id }, data: { usedCount: { increment: 1 } } }),
        ]);

        // Credit balance (netUsd = creditUSD — no payment fee for promos)
        const orderId = `promo_${code}_${userId}`;
        await safeTopUp(orderId, Number(newApiUserId), promo.creditUSD, "promo_code", promo.creditUSD);

        return NextResponse.json({
            success: true,
            creditUSD: promo.creditUSD,
            message: `$${promo.creditUSD.toFixed(2)} added to your balance!`,
        });
    } catch (err) {
        console.error("[promo/redeem] Error:", err);
        return NextResponse.json({ success: false, message: "Internal server error." }, { status: 500 });
    }
}
