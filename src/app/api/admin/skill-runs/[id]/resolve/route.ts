import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
    const resolvedBy = req.headers.get("x-admin-email") ?? "admin";

    await prisma.$executeRawUnsafe(
        `UPDATE "SkillRun"
         SET "resolvedAt" = NOW(),
             "resolvedBy" = $2,
             "resolutionNote" = $3,
             "updatedAt" = NOW()
         WHERE id = $1`,
        id,
        resolvedBy,
        note,
    );

    return NextResponse.json({ success: true, id, resolvedBy, note });
}
