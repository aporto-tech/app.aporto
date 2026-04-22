/**
 * DELETE /api/publisher/keys/[id] — revoke an API key
 */
import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError, pubError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { id } = await params;
    const keyId = id;
    if (!keyId) return pubError("INVALID_ID", "Invalid key id.", 400);

    const rows = await prisma.$queryRawUnsafe<{ id: string; revoked_at: string | null }[]>(
        `SELECT id, "revokedAt" AS revoked_at FROM "PublisherApiKey"
         WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        keyId, publisherId,
    );

    if (rows.length === 0) return pubError("NOT_FOUND", "Key not found.", 404);
    if (rows[0].revoked_at) return NextResponse.json({ success: true, alreadyRevoked: true });

    await prisma.$executeRawUnsafe(
        `UPDATE "PublisherApiKey" SET "revokedAt" = NOW() WHERE id = $1`,
        keyId,
    );

    return NextResponse.json({ success: true });
}
