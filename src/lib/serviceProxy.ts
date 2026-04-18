/**
 * Shared helpers for non-LLM service proxy routes.
 *
 * - validateApiKeyOrSession: dual auth (NextAuth session OR Bearer API key)
 * - deductUserQuota: deducts costUSD from the user's balance in New-API's users table
 * - logServiceUsage: writes a ServiceUsage row for analytics
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { sendInsufficientBalanceEmail } from "@/lib/emails";

const QUOTA_PER_DOLLAR = 500_000;

export interface AuthResult {
    newApiUserId: number;
    tokenId: number | null;
}

/**
 * Validate auth from either a NextAuth session cookie or a Bearer API key.
 * Returns null and writes a 401/402 response on failure.
 *
 * Usage:
 *   const auth = await validateApiKeyOrSession(req);
 *   if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
 */
export async function validateApiKeyOrSession(
    req: NextRequest
): Promise<AuthResult | null> {
    // 1. Try session first (dashboard use)
    const session = await getServerSession(authOptions);
    if (session?.user && (session.user as any).newApiUserId) {
        return {
            newApiUserId: Number((session.user as any).newApiUserId),
            tokenId: null,
        };
    }

    // 2. Fall back to Bearer token (agent use)
    const authHeader = req.headers.get("authorization") || "";
    const raw = authHeader.replace(/^Bearer\s+/i, "").trim();
    // Accept both sk-live-{key} (Aporto dashboard) and sk-{key} (New-API format)
    const key = raw.startsWith("sk-live-")
        ? raw.slice("sk-live-".length)
        : raw.startsWith("sk-")
        ? raw.slice("sk-".length)
        : raw;

    if (!key) return null;

    const rows = await prisma.$queryRawUnsafe<{ id: number; user_id: number }[]>(
        `SELECT id, user_id FROM tokens WHERE key = $1 AND status = 1 AND deleted_at IS NULL LIMIT 1`,
        key
    );

    if (!rows.length) return null;

    return { newApiUserId: rows[0].user_id, tokenId: rows[0].id };
}

/**
 * Check user has enough balance and deduct costUSD from New-API's users table.
 * Returns a 402 NextResponse if insufficient balance, or null on success.
 */
export async function deductUserQuota(
    newApiUserId: number,
    costUSD: number
): Promise<NextResponse | null> {
    if (costUSD <= 0) return null;

    const quotaCost = Math.ceil(costUSD * QUOTA_PER_DOLLAR);

    // Balance check
    const rows = await prisma.$queryRawUnsafe<{ quota: number }[]>(
        `SELECT quota FROM users WHERE id = $1 LIMIT 1`,
        newApiUserId
    );

    if (!rows.length || rows[0].quota < quotaCost) {
        void maybySendLowBalanceEmail(newApiUserId).catch(
            (e) => console.error("[deductUserQuota] balance email failed:", e)
        );
        return NextResponse.json(
            { success: false, message: "Insufficient balance" },
            {
                status: 402,
                headers: { "X-Aporto-Balance-Low": "true" },
            }
        );
    }

    await prisma.$executeRawUnsafe(
        `UPDATE users SET quota = quota - $1, used_quota = used_quota + $1 WHERE id = $2`,
        quotaCost,
        newApiUserId
    );

    return null;
}

/**
 * Log a non-LLM service call to the service_usages table.
 * Silent on failure — never block the response.
 */
export async function logServiceUsage(
    newApiUserId: number,
    service: string,
    provider: string,
    costUSD: number,
    metadata?: Record<string, unknown>
): Promise<void> {
    try {
        await (prisma as any).serviceUsage.create({
            data: {
                newApiUserId,
                service,
                provider,
                costUSD,
                metadata: metadata ? JSON.stringify(metadata) : null,
            },
        });
    } catch {
        // Table may not exist yet on first deploy; non-fatal
    }
}

/**
 * In-process dedup cache: skip DB query if we already checked within 30s.
 * Prevents pool pressure under burst 402 storms.
 */
const RECENT_BALANCE_CHECK_CACHE = new Map<number, number>(); // newApiUserId → lastCheckTimestamp

/**
 * Atomically rate-limit low-balance emails to 1 per 24h per user.
 * Uses updateMany WHERE to prevent concurrent requests sending duplicate emails.
 */
async function maybySendLowBalanceEmail(newApiUserId: number): Promise<void> {
    const now = Date.now();
    const lastCheck = RECENT_BALANCE_CHECK_CACHE.get(newApiUserId) ?? 0;
    if (now - lastCheck < 30_000) return;
    RECENT_BALANCE_CHECK_CACHE.set(newApiUserId, now);

    // Atomic 24h dedup: update only if last send was >24h ago (or never).
    // rowsAffected = 0 means another concurrent request already claimed the send window.
    const cutoff = new Date(now - 24 * 60 * 60 * 1000);
    const result = await prisma.user.updateMany({
        where: {
            newApiUserId,
            OR: [
                { lastInsufficientBalanceEmailAt: null },
                { lastInsufficientBalanceEmailAt: { lt: cutoff } },
            ],
        },
        data: { lastInsufficientBalanceEmailAt: new Date() },
    });

    if (result.count === 0) return; // already sent within 24h

    const user = await prisma.user.findFirst({
        where: { newApiUserId },
        select: { email: true },
    });
    if (!user?.email) {
        console.warn(`[deductUserQuota] no email for newApiUserId=${newApiUserId}`);
        return;
    }

    // Fetch current balance for the email body — non-critical, defaults to $0.
    let currentBalanceUSD = 0;
    try {
        const balanceRows = await prisma.$queryRawUnsafe<{ quota: number }[]>(
            `SELECT quota FROM users WHERE id = $1 LIMIT 1`,
            newApiUserId
        );
        if (balanceRows.length) {
            currentBalanceUSD = balanceRows[0].quota / QUOTA_PER_DOLLAR;
        }
    } catch {
        // Non-critical — email sends with $0.00 balance display
    }

    await sendInsufficientBalanceEmail({ email: user.email, currentBalanceUSD });
}
