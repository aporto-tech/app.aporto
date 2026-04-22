/**
 * Publisher API key authentication.
 *
 * Keys have format: sk-pub-{40 random hex bytes}
 * Storage: sha256(key) as lookupHash (indexed), hmac-sha256(key, secret) as keyHmac (anti-rainbow).
 * We never store the plaintext key.
 *
 * Env required: PUBLISHER_KEY_HMAC_SECRET
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export interface PublisherAuth {
    publisherId: string;
    publisher: {
        id: string;
        displayName: string;
        revenueShare: number;
        status: string;
    };
}

function sha256hex(input: string): string {
    return createHash("sha256").update(input).digest("hex");
}

function hmacHex(input: string): string {
    const secret = process.env.PUBLISHER_KEY_HMAC_SECRET;
    if (!secret) throw new Error("PUBLISHER_KEY_HMAC_SECRET not set");
    return createHmac("sha256", secret).update(input).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export type AuthErrorCode =
    | "KEY_NOT_FOUND"
    | "KEY_REVOKED"
    | "PUBLISHER_PENDING"
    | "PUBLISHER_SUSPENDED"
    | "MISSING_HEADER";

export interface AuthResult {
    ok: boolean;
    auth?: PublisherAuth;
    errorCode?: AuthErrorCode;
    message?: string;
}

export async function validatePublisherKey(req: NextRequest): Promise<AuthResult> {
    const header = req.headers.get("authorization");
    if (!header?.startsWith("Bearer sk-pub-")) {
        return { ok: false, errorCode: "MISSING_HEADER", message: "Missing or invalid Authorization header. Expected: Bearer sk-pub-..." };
    }
    const key = header.slice("Bearer ".length);

    const lookupHash = sha256hex(key);

    const rows = await prisma.$queryRawUnsafe<{
        id: string;
        publisherId: string;
        keyHmac: string;
        revokedAt: Date | null;
        pStatus: string;
        pDisplayName: string;
        pRevenueShare: number;
    }[]>(
        `SELECT k.id, k."publisherId", k."keyHmac", k."revokedAt",
                p.status AS "pStatus", p."displayName" AS "pDisplayName", p."revenueShare" AS "pRevenueShare"
         FROM "PublisherApiKey" k
         JOIN "Publisher" p ON p.id = k."publisherId"
         WHERE k."lookupHash" = $1
         LIMIT 1`,
        lookupHash,
    );

    if (rows.length === 0) {
        return { ok: false, errorCode: "KEY_NOT_FOUND", message: "API key not found." };
    }

    const row = rows[0];

    // Constant-time HMAC verification
    let expectedHmac: string;
    try {
        expectedHmac = hmacHex(key);
    } catch {
        return { ok: false, errorCode: "KEY_NOT_FOUND", message: "Server misconfiguration." };
    }

    if (!constantTimeEqual(expectedHmac, row.keyHmac)) {
        return { ok: false, errorCode: "KEY_NOT_FOUND", message: "API key not found." };
    }

    if (row.revokedAt !== null) {
        return { ok: false, errorCode: "KEY_REVOKED", message: "This API key has been revoked." };
    }

    if (row.pStatus === "pending") {
        return { ok: false, errorCode: "PUBLISHER_PENDING", message: "Your publisher account is pending approval." };
    }

    if (row.pStatus === "suspended") {
        return { ok: false, errorCode: "PUBLISHER_SUSPENDED", message: "Your publisher account has been suspended." };
    }

    // Update lastUsedAt fire-and-forget
    void prisma.$executeRawUnsafe(
        `UPDATE "PublisherApiKey" SET "lastUsedAt" = NOW() WHERE id = $1`,
        row.id,
    ).catch((e: unknown) => console.error("[publisherAuth] lastUsedAt update failed:", e));

    return {
        ok: true,
        auth: {
            publisherId: row.publisherId,
            publisher: {
                id: row.publisherId,
                displayName: row.pDisplayName,
                revenueShare: Number(row.pRevenueShare),
                status: row.pStatus,
            },
        },
    };
}

/** Convenience wrapper that returns auth or throws a NextResponse-compatible error object. */
export async function requirePublisher(req: NextRequest): Promise<PublisherAuth> {
    const result = await validatePublisherKey(req);
    if (!result.ok || !result.auth) {
        throw { code: result.errorCode, message: result.message };
    }
    return result.auth;
}

/** Generate a new publisher API key. Returns { key, lookupHash, keyHmac, prefix }. */
export function generatePublisherKey(): { key: string; lookupHash: string; keyHmac: string; prefix: string } {
    const { randomBytes } = require("crypto") as typeof import("crypto");
    const raw = randomBytes(40).toString("hex"); // 80 hex chars
    const key = `sk-pub-${raw}`;
    const prefix = key.slice(0, 15); // "sk-pub-" + first 8 chars of hex
    const lookupHash = sha256hex(key);
    const keyHmac = hmacHex(key);
    return { key, lookupHash, keyHmac, prefix };
}
