import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = "pevzner@aporto.tech";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.email !== ADMIN_EMAIL) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    try {
        // Delete redemptions first due to FK constraint
        await prisma.promoRedemption.deleteMany({ where: { promoCodeId: id } });
        await prisma.promoCode.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Code not found" }, { status: 404 });
    }
}
