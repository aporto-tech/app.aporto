/**
 * Publisher API key management.
 *
 * GET    /api/publisher/keys      — list keys (prefix only)
 * POST   /api/publisher/keys      — create new key (plaintext shown once)
 * DELETE /api/publisher/keys/[id] — revoke key (handled in [id]/route.ts)
 */
import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey, generatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError, pubError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const keys = await prisma.$queryRawUnsafe<{
        id: string; name: string; prefix: string;
        last_used_at: string | null; revoked_at: string | null; created_at: string;
    }[]>(
        `SELECT id, name, prefix, "lastUsedAt" AS last_used_at, "revokedAt" AS revoked_at, "createdAt" AS created_at
         FROM "PublisherApiKey"
         WHERE "publisherId" = $1
         ORDER BY "createdAt" DESC`,
        publisherId,
    );

    return NextResponse.json({ success: true, keys });
}

export async function POST(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const body = await req.json().catch(() => ({}));
    const name = body.name ?? "Default key";

    const { key, lookupHash, keyHmac, prefix } = generatePublisherKey();

    const keyId = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "PublisherApiKey" (id, "publisherId", name, "lookupHash", "keyHmac", prefix, "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())
         RETURNING id`,
        publisherId, name, lookupHash, keyHmac, prefix,
    );

    // Return plaintext key once — cannot be recovered
    return NextResponse.json({
        success: true,
        id: keyId[0].id,
        key,          // shown ONCE, not stored
        prefix,
        name,
        warning: "Store this key securely. It cannot be retrieved again.",
    }, { status: 201 });
}
