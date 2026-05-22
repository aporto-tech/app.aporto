import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { hashTelegramLinkCode } from "@/lib/telegramLink";

export const dynamic = "force-dynamic";

const LINK_TTL_MINUTES = 10;

function makeCode(): string {
    return randomBytes(4).toString("hex").toUpperCase();
}

async function getAuthUser() {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const newApiUserId = Number((session?.user as { newApiUserId?: unknown } | undefined)?.newApiUserId);
    if (!userId || !Number.isFinite(newApiUserId) || newApiUserId <= 0) return null;
    return { userId, newApiUserId };
}

export async function GET() {
    const auth = await getAuthUser();
    if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const account = await prisma.telegramAccount.findFirst({
        where: { userId: auth.userId },
        select: {
            telegramUserId: true,
            chatId: true,
            username: true,
            firstName: true,
            linkedAt: true,
            lastSeenAt: true,
        },
    });

    return NextResponse.json({ success: true, linked: Boolean(account), account });
}

export async function POST() {
    const auth = await getAuthUser();
    if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await prisma.telegramLinkToken.updateMany({
        where: {
            userId: auth.userId,
            usedAt: null,
            expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
    });

    const code = makeCode();
    const expiresAt = new Date(Date.now() + LINK_TTL_MINUTES * 60 * 1000);
    await prisma.telegramLinkToken.create({
        data: {
            userId: auth.userId,
            codeHash: hashTelegramLinkCode(code),
            expiresAt,
        },
    });

    return NextResponse.json({
        success: true,
        code,
        command: `/link ${code}`,
        expiresAt: expiresAt.toISOString(),
    });
}

export async function DELETE() {
    const auth = await getAuthUser();
    if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await prisma.telegramAccount.deleteMany({ where: { userId: auth.userId } });
    return NextResponse.json({ success: true });
}
