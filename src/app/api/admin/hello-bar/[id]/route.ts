import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function cleanColor(value: unknown, fallback: string) {
    const color = typeof value === "string" ? value.trim() : "";
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function cleanHref(value: unknown) {
    const href = typeof value === "string" ? value.trim() : "";
    if (!href) return null;
    if (href.startsWith("/") || href.startsWith("https://") || href.startsWith("http://")) return href;
    return null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const data: {
        text?: string;
        href?: string | null;
        backgroundColor?: string;
        textColor?: string;
        isActive?: boolean;
        sortOrder?: number;
    } = {};

    if ("text" in body) {
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (text.length < 3) {
            return NextResponse.json({ error: "Text must be at least 3 characters." }, { status: 400 });
        }
        data.text = text;
    }
    if ("href" in body) data.href = cleanHref(body.href);
    if ("backgroundColor" in body) data.backgroundColor = cleanColor(body.backgroundColor, "#00dc82");
    if ("textColor" in body) data.textColor = cleanColor(body.textColor, "#000000");
    if ("isActive" in body) data.isActive = Boolean(body.isActive);
    if ("sortOrder" in body && Number.isInteger(Number(body.sortOrder))) data.sortOrder = Number(body.sortOrder);

    const announcement = await prisma.helloBarAnnouncement.update({
        where: { id },
        data,
    });

    return NextResponse.json({ success: true, announcement });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.helloBarAnnouncement.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
