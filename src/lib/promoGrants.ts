import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const QUOTA_PER_DOLLAR = 500_000;

export type SkillCharge = {
    requestedUSD: number;
    promoCoveredUSD: number;
    balanceChargedUSD: number;
    promoRedemptionId: string | null;
    error: NextResponse | null;
};

function roundUsd(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
}

export async function deductSkillUsage(newApiUserId: number, skillId: number, costUSD: number): Promise<SkillCharge> {
    const requestedUSD = roundUsd(Math.max(0, costUSD));
    if (requestedUSD <= 0) {
        return { requestedUSD: 0, promoCoveredUSD: 0, balanceChargedUSD: 0, promoRedemptionId: null, error: null };
    }

    return prisma.$transaction(async (tx) => {
        const grantRows = await tx.$queryRawUnsafe<{
            id: string;
            creditLimitUSD: number;
            creditUsedUSD: number;
        }[]>(
            `SELECT pr.id, pr."creditLimitUSD", pr."creditUsedUSD"
             FROM "PromoRedemption" pr
             JOIN "User" u ON u.id = pr."userId"
             WHERE u."newApiUserId" = $1
               AND pr."creditLimitUSD" IS NOT NULL
               AND pr."creditUsedUSD" < pr."creditLimitUSD"
               AND (pr."expiresAt" IS NULL OR pr."expiresAt" > NOW())
               AND (
                 pr."skillIds" = '[]'::jsonb
                 OR pr."skillIds" @> $2::jsonb
               )
             ORDER BY pr."expiresAt" ASC NULLS LAST, pr."redeemedAt" ASC
             LIMIT 1
             FOR UPDATE`,
            newApiUserId,
            JSON.stringify([skillId]),
        );

        let promoCoveredUSD = 0;
        let promoRedemptionId: string | null = null;
        const grant = grantRows[0];
        if (grant) {
            const remainingGrantUSD = Math.max(0, Number(grant.creditLimitUSD) - Number(grant.creditUsedUSD));
            promoCoveredUSD = roundUsd(Math.min(requestedUSD, remainingGrantUSD));
            promoRedemptionId = grant.id;
        }

        const balanceChargedUSD = roundUsd(requestedUSD - promoCoveredUSD);
        if (balanceChargedUSD > 0) {
            const quotaCost = Math.ceil(balanceChargedUSD * QUOTA_PER_DOLLAR);
            const balanceRows = await tx.$executeRawUnsafe(
                `UPDATE users
                 SET quota = quota - $1, used_quota = used_quota + $1
                 WHERE id = $2 AND quota >= $1`,
                quotaCost,
                newApiUserId,
            );

            if (balanceRows === 0) {
                return {
                    requestedUSD,
                    promoCoveredUSD: 0,
                    balanceChargedUSD: 0,
                    promoRedemptionId: null,
                    error: NextResponse.json(
                        { success: false, message: "Insufficient balance" },
                        { status: 402, headers: { "X-Aporto-Balance-Low": "true" } },
                    ),
                };
            }
        }

        if (promoCoveredUSD > 0 && promoRedemptionId) {
            await tx.$executeRawUnsafe(
                `UPDATE "PromoRedemption"
                 SET "creditUsedUSD" = "creditUsedUSD" + $2
                 WHERE id = $1`,
                promoRedemptionId,
                promoCoveredUSD,
            );
        }

        return { requestedUSD, promoCoveredUSD, balanceChargedUSD, promoRedemptionId, error: null };
    });
}

export async function refundSkillUsage(newApiUserId: number, charge: Pick<SkillCharge, "promoRedemptionId" | "promoCoveredUSD" | "balanceChargedUSD">): Promise<void> {
    await prisma.$transaction(async (tx) => {
        if (charge.balanceChargedUSD > 0) {
            await tx.$executeRawUnsafe(
                `UPDATE users
                 SET quota = quota + $1, used_quota = used_quota - $1
                 WHERE id = $2`,
                Math.ceil(charge.balanceChargedUSD * QUOTA_PER_DOLLAR),
                newApiUserId,
            );
        }

        if (charge.promoRedemptionId && charge.promoCoveredUSD > 0) {
            await tx.$executeRawUnsafe(
                `UPDATE "PromoRedemption"
                 SET "creditUsedUSD" = GREATEST(0, "creditUsedUSD" - $2)
                 WHERE id = $1`,
                charge.promoRedemptionId,
                charge.promoCoveredUSD,
            );
        }
    });
}
