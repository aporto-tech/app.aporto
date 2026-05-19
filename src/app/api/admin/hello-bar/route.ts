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

export async function GET() {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const announcements = await prisma.helloBarAnnouncement.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, announcements });
}

export async function POST(req: Request) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 3) {
        return NextResponse.json({ error: "Text must be at least 3 characters." }, { status: 400 });
    }

    const announcement = await prisma.helloBarAnnouncement.create({
        data: {
            text,
            href: cleanHref(body.href),
            backgroundColor: cleanColor(body.backgroundColor, "#00dc82"),
            textColor: cleanColor(body.textColor, "#000000"),
            isActive: Boolean(body.isActive),
            sortOrder: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        },
    });

    return NextResponse.json({ success: true, announcement });
}
