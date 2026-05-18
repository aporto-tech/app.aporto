import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { safeTopUp } from "@/lib/topup";

function formatSkillGrant(skillIds: unknown, limitUSD: number | null, expiresAt: Date | null) {
    if (!limitUSD || limitUSD <= 0) return null;
    const ids = Array.isArray(skillIds) ? skillIds.filter((id) => Number.isInteger(Number(id))) : [];
    const scope = ids.length === 0 ? "all skills" : `skills ${ids.join(", ")}`;
    const expiry = expiresAt ? ` until ${expiresAt.toLocaleDateString("en-US")}` : "";
    return `$${limitUSD.toFixed(2)} free usage for ${scope}${expiry}`;
}

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

        const result = await prisma.$transaction(async (tx) => {
            const promo = await tx.promoCode.findUnique({ where: { code } });

            if (!promo) {
                return { error: "Invalid promo code.", status: 404 as const };
            }

            if (promo.expiresAt && promo.expiresAt < new Date()) {
                return { error: "This promo code has expired.", status: 400 as const };
            }

            const existing = await tx.promoRedemption.findUnique({
                where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
            });
            if (existing) {
                return { error: "You have already redeemed this promo code.", status: 400 as const };
            }

            const updated = await tx.promoCode.updateMany({
                where: {
                    id: promo.id,
                    usedCount: { lt: promo.maxUses },
                },
                data: { usedCount: { increment: 1 } },
            });
            if (updated.count === 0) {
                return { error: "This promo code has already been fully redeemed.", status: 400 as const };
            }

            const grantExpiresAt = promo.grantExpiresAt ?? promo.expiresAt;
            const skillIds = Array.isArray(promo.skillIds) ? promo.skillIds : [];
            await tx.promoRedemption.create({
                data: {
                    promoCodeId: promo.id,
                    userId,
                    skillIds,
                    creditLimitUSD: promo.grantLimitUSD,
                    creditUsedUSD: 0,
                    expiresAt: grantExpiresAt,
                },
            });

            return { promo, grantExpiresAt };
        });

        if ("error" in result) {
            return NextResponse.json({ success: false, message: result.error }, { status: result.status });
        }

        const { promo, grantExpiresAt } = result;
        if (promo.creditUSD > 0) {
            const orderId = `promo_${code}_${userId}`;
            await safeTopUp(orderId, Number(newApiUserId), promo.creditUSD, "promo_code", promo.creditUSD);
        }

        const messages = [];
        if (promo.creditUSD > 0) messages.push(`$${promo.creditUSD.toFixed(2)} added to your balance`);
        const skillGrant = formatSkillGrant(promo.skillIds, promo.grantLimitUSD, grantExpiresAt);
        if (skillGrant) messages.push(skillGrant);

        return NextResponse.json({
            success: true,
            creditUSD: promo.creditUSD,
            grantLimitUSD: promo.grantLimitUSD,
            skillIds: promo.skillIds,
            grantExpiresAt,
            message: `${messages.join(" and ")}!`,
        });
    } catch (err) {
        console.error("[promo/redeem] Error:", err);
        return NextResponse.json({ success: false, message: "Internal server error." }, { status: 500 });
    }
}
