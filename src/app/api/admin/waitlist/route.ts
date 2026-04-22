/**
 * Admin Publisher Waitlist API
 * GET   /api/admin/waitlist          — list all entries
 * PATCH /api/admin/waitlist?id=N     — approve entry
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function checkAdmin() {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
}

export async function GET() {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const entries = await prisma.publisherWaitlist.findMany({
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ entries });
}

export async function PATCH(req: NextRequest) {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await prisma.publisherWaitlist.update({
        where: { id },
        data: { approved: true },
    });

    return NextResponse.json({ success: true });
}
