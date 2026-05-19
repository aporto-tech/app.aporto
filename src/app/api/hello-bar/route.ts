import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
    const announcements = await prisma.helloBarAnnouncement.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: {
            id: true,
            text: true,
            href: true,
            backgroundColor: true,
            textColor: true,
        },
    });

    return NextResponse.json({ success: true, announcements }, { headers: corsHeaders });
}
