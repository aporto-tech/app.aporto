import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { email, name, useCase } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
        return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    try {
        await prisma.publisherWaitlist.create({
            data: { email: email.toLowerCase().trim(), name: name ?? null, useCase: useCase ?? null },
        });
        return NextResponse.json({ success: true });
    } catch (err: any) {
        if (err?.code === "P2002") {
            // Unique constraint — already on waitlist
            return NextResponse.json({ success: true, alreadyRegistered: true });
        }
        console.error("[waitlist/publishers] error:", err);
        return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 });
    }
}
