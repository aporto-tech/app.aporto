import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = "pevzner@aporto.tech";

function isAdmin(email?: string | null) {
    return email === ADMIN_EMAIL;
}

function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "BETA-";
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!isAdmin((session?.user as any)?.email)) {
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
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
        redemptions: c.redemptions.map(r => ({
            userId: r.userId,
            redeemedAt: r.redeemedAt,
            email: userMap[r.userId]?.email ?? null,
            name: userMap[r.userId]?.name ?? null,
        })),
    }));

    return NextResponse.json({ codes: result });
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!isAdmin((session?.user as any)?.email)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const creditUSD = Number(body.creditUSD);
    if (!creditUSD || creditUSD <= 0) {
        return NextResponse.json({ error: "creditUSD must be > 0" }, { status: 400 });
    }

    const maxUses = body.maxUses ? Number(body.maxUses) : 1;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const code = body.code ? String(body.code).trim().toUpperCase() : generateCode();

    const promo = await prisma.promoCode.create({
        data: { code, creditUSD, maxUses, expiresAt },
    });

    return NextResponse.json({ success: true, code: promo.code, id: promo.id });
}
