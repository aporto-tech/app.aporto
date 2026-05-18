import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "BETA-";
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function parseSkillIds(value: unknown): number[] {
    const rawValues = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split(",")
          : [];

    return [...new Set(rawValues
        .map((item) => Number(String(item).trim()))
        .filter((item) => Number.isInteger(item) && item > 0))];
}

function parseOptionalDate(value: unknown): Date | null {
    if (!value) return null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(req: Request) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const codes = await prisma.promoCode.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            redemptions: {
                orderBy: { redeemedAt: "desc" },
                include: {
                    promoCode: false,
                },
            },
        },
    });

    // Get user emails for redemptions
    const userIds = [...new Set(codes.flatMap(c => c.redemptions.map(r => r.userId)))];
    const users = userIds.length
        ? await prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, email: true, name: true },
          })
        : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const result = codes.map(c => ({
        id: c.id,
        code: c.code,
        creditUSD: c.creditUSD,
        skillIds: c.skillIds,
        grantLimitUSD: c.grantLimitUSD,
        grantExpiresAt: c.grantExpiresAt,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
        redemptions: c.redemptions.map(r => ({
            userId: r.userId,
            redeemedAt: r.redeemedAt,
            skillIds: r.skillIds,
            creditLimitUSD: r.creditLimitUSD,
            creditUsedUSD: r.creditUsedUSD,
            expiresAt: r.expiresAt,
            email: userMap[r.userId]?.email ?? null,
            name: userMap[r.userId]?.name ?? null,
        })),
    }));

    return NextResponse.json({ codes: result });
}

export async function POST(req: Request) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const creditUSD = body.creditUSD == null || body.creditUSD === "" ? 0 : Number(body.creditUSD);
    const grantLimitUSD = body.grantLimitUSD == null || body.grantLimitUSD === "" ? null : Number(body.grantLimitUSD);
    if (!Number.isFinite(creditUSD) || creditUSD < 0) {
        return NextResponse.json({ error: "creditUSD must be >= 0" }, { status: 400 });
    }
    if (grantLimitUSD != null && (!Number.isFinite(grantLimitUSD) || grantLimitUSD <= 0)) {
        return NextResponse.json({ error: "grantLimitUSD must be > 0" }, { status: 400 });
    }
    if (creditUSD <= 0 && !grantLimitUSD) {
        return NextResponse.json({ error: "Set balance credit or skill grant limit." }, { status: 400 });
    }

    const maxUses = body.maxUses ? Number(body.maxUses) : 1;
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
        return NextResponse.json({ error: "maxUses must be a positive integer" }, { status: 400 });
    }
    const expiresAt = parseOptionalDate(body.expiresAt);
    const grantExpiresAt = parseOptionalDate(body.grantExpiresAt);
    if (body.expiresAt && !expiresAt) {
        return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
    }
    if (body.grantExpiresAt && !grantExpiresAt) {
        return NextResponse.json({ error: "Invalid grantExpiresAt" }, { status: 400 });
    }
    const skillIds = parseSkillIds(body.skillIds);
    const code = body.code ? String(body.code).trim().toUpperCase() : generateCode();

    const promo = await prisma.promoCode.create({
        data: { code, creditUSD, skillIds, grantLimitUSD, grantExpiresAt, maxUses, expiresAt },
    });

    return NextResponse.json({ success: true, code: promo.code, id: promo.id });
}
