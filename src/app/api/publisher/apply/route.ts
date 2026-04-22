/**
 * POST /api/publisher/apply
 * Create a Publisher record for the authenticated user (session auth, not publisher key).
 * Sets status="pending". Admin must approve before the publisher can use the publisher API.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { pubError } from "@/lib/pubErrors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return pubError("UNAUTHENTICATED", "You must be logged in to apply as a publisher.", 401);
    }

    const body = await req.json();
    const { displayName, website, description } = body;

    if (!displayName || typeof displayName !== "string" || displayName.trim().length < 2) {
        return pubError("VALIDATION_FAILED", "displayName is required (minimum 2 characters).", 400);
    }

    // Look up User.id from session email
    const userRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "User" WHERE email = $1 LIMIT 1`,
        session.user.email,
    );
    if (userRows.length === 0) {
        return pubError("USER_NOT_FOUND", "User account not found.", 404);
    }
    const userId = userRows[0].id;

    // Check if already a publisher
    const existing = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
        `SELECT id, status FROM "Publisher" WHERE "userId" = $1 LIMIT 1`,
        userId,
    );
    if (existing.length > 0) {
        return NextResponse.json({ success: true, publisherId: existing[0].id, status: existing[0].status, alreadyExists: true });
    }

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "Publisher" ("id", "userId", "displayName", "website", "description", "status", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'pending', NOW())
         RETURNING id`,
        userId,
        displayName.trim(),
        website ?? null,
        description ?? null,
    );

    return NextResponse.json({ success: true, publisherId: rows[0].id, status: "pending" }, { status: 201 });
}
