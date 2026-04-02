import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import {
    newApiUpdateTokenQuota,
    newApiSetTokenModels,
    newApiGetTodayTokenSpend,
} from "@/lib/newapi";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || !(session.user as any).newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }
        const newApiUserId = Number((session.user as any).newApiUserId);

        const rules = await prisma.rule.findMany({
            where: { newApiUserId },
            orderBy: { createdAt: "desc" },
        });

        // Enrich each rule with current usage data
        const enriched = await Promise.all(
            rules.map(async (rule) => {
                let usedUSD = 0;
                let remainingUSD: number | null = null;
                let currentModels = "";

                if (rule.type === "total_limit" && rule.limitUSD != null) {
                    const rows = await prisma.$queryRawUnsafe<any[]>(
                        `SELECT remain_quota FROM tokens WHERE id = $1`,
                        rule.tokenId
                    );
                    const remQuota = Number(rows[0]?.remain_quota ?? 0);
                    remainingUSD = remQuota / 500_000;
                    usedUSD = rule.limitUSD - remainingUSD;
                } else if (rule.type === "daily_limit") {
                    usedUSD = await newApiGetTodayTokenSpend(rule.tokenId);
                } else if (rule.type === "model_allowlist") {
                    const rows = await prisma.$queryRawUnsafe<any[]>(
                        `SELECT model_limits FROM tokens WHERE id = $1`,
                        rule.tokenId
                    );
                    currentModels = rows[0]?.model_limits ?? "";
                }

                return {
                    ...rule,
                    limitUSD: rule.limitUSD ?? null,
                    models: rule.models ?? null,
                    usedUSD: Math.max(0, usedUSD),
                    remainingUSD,
                    currentModels,
                };
            })
        );

        return NextResponse.json({ success: true, rules: enriched });
    } catch (error) {
        console.error("[rules] GET error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || !(session.user as any).newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }
        const newApiUserId = Number((session.user as any).newApiUserId);

        const body = await req.json();
        const { tokenId, tokenName, type, limitUSD, models } = body;

        if (!tokenId || !tokenName || !type) {
            return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
        }

        // Verify the token belongs to this user
        const tokenRows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id FROM tokens WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
            Number(tokenId),
            newApiUserId
        );
        if (!tokenRows.length) {
            return NextResponse.json({ success: false, message: "Token not found" }, { status: 404 });
        }

        // Prevent duplicate rule of same type on same token
        const existing = await prisma.rule.findFirst({
            where: { newApiUserId, tokenId: Number(tokenId), type },
        });
        if (existing) {
            return NextResponse.json(
                { success: false, message: "A rule of this type already exists for this key" },
                { status: 409 }
            );
        }

        // Apply enforcement immediately
        if (type === "total_limit" && limitUSD != null) {
            await newApiUpdateTokenQuota({
                tokenId: Number(tokenId),
                userId: newApiUserId,
                name: tokenName,
                remain_quota: Math.floor(Number(limitUSD) * 500_000),
                unlimited_quota: false,
            });
        } else if (type === "model_allowlist" && models) {
            const modelStr = Array.isArray(models) ? models.join(",") : String(models);
            await newApiSetTokenModels(Number(tokenId), newApiUserId, modelStr);
        }
        // daily_limit: enforcement runs on /api/rules/enforce call, no immediate token change

        const rule = await prisma.rule.create({
            data: {
                newApiUserId,
                tokenId: Number(tokenId),
                tokenName,
                type,
                limitUSD: limitUSD != null ? Number(limitUSD) : null,
                models: models ? (Array.isArray(models) ? models.join(",") : String(models)) : null,
                enabled: true,
            },
        });

        return NextResponse.json({ success: true, rule });
    } catch (error) {
        console.error("[rules] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
