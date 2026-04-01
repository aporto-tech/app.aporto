import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/** OTP time-to-live in milliseconds. Shared between register, verify-email, and resend-otp. */
export const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Rate-limit window: minimum gap between resend requests. */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

/** Generate a cryptographically secure 6-digit OTP string. */
export function generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
}

/**
 * Atomically upsert an OTP for the given email:
 * 1. Delete any existing tokens for this identifier.
 * 2. Create a new token with a fresh OTP and expiry.
 * Retries up to 3 times on unique-constraint violations (global token @unique).
 *
 * Returns the generated OTP string so callers can send it via email.
 */
export async function upsertOtp(email: string): Promise<string> {
    const expires = new Date(Date.now() + OTP_TTL_MS);

    for (let attempt = 0; attempt < 3; attempt++) {
        const otp = generateOtp();
        try {
            await prisma.$transaction([
                prisma.verificationToken.deleteMany({ where: { identifier: email } }),
                prisma.verificationToken.create({
                    data: { identifier: email, token: otp, expires },
                }),
            ]);
            return otp;
        } catch (err: any) {
            // P2002 = Prisma unique constraint violation
            if (err?.code === "P2002" && attempt < 2) {
                continue;
            }
            throw err;
        }
    }

    // Unreachable but satisfies TypeScript
    throw new Error("[otp] Failed to generate unique OTP after 3 attempts");
}
