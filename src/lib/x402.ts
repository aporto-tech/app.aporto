/**
 * x402 proof signing and verification.
 *
 * The x402 protocol lets AI agents auto-pay for external API calls that respond
 * with HTTP 402. Aporto uses internal credits (not real USDC), so no blockchain
 * or money-transmission license is needed.
 *
 * Proof token format: v1.{ts}.{exp}.{userId}.{HMAC-SHA256-hex}
 *   ts     — issued-at Unix milliseconds
 *   exp    — expiry Unix milliseconds (5 minutes after ts)
 *   userId — Aporto user ID (so external APIs can verify without knowing it separately)
 *   sig    — HMAC over "ts:exp:network:recipient:canonicalAmount:userId"
 *
 * Both exp and userId are inside the signed payload — changing either field in
 * the token string would invalidate the HMAC.
 */

import { createHmac } from "crypto";

const X402_SECRET = process.env.X402_SECRET;
if (!X402_SECRET) {
    throw new Error("[x402] X402_SECRET env var is required. Add it to .env.local.");
}

const PROOF_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Canonical amount: "0.001" and "0.0010" both become "0.001000" */
function canonical(amount: string): string {
    return parseFloat(amount).toFixed(6);
}

export interface X402ProofParams {
    network: string;
    recipient: string;
    amount: string;
    userId: number;
}

/**
 * Sign a payment proof. Called by /api/x402/pay after deducting quota.
 * Returns a token string to include as the X-Payment-Proof header.
 */
export function signX402Proof(params: X402ProofParams): string {
    const ts = Date.now();
    const exp = ts + PROOF_TTL_MS;
    const payload = [
        ts,
        exp,
        params.network,
        params.recipient,
        canonical(params.amount),
        params.userId,
    ].join(":");
    const sig = createHmac("sha256", X402_SECRET!).update(payload).digest("hex");
    return `v1.${ts}.${exp}.${params.userId}.${sig}`;
}

export interface X402VerifyResult {
    valid: boolean;
    reason?: string;
    userId?: number;
}

/**
 * Verify a proof token.
 *
 * For server-side use by Aporto (has access to X402_SECRET).
 * External APIs without the secret should call GET /api/x402/verify instead.
 */
export function verifyX402Proof(
    token: string,
    params: Omit<X402ProofParams, "userId">
): X402VerifyResult {
    const parts = token.split(".");
    if (parts.length !== 5 || parts[0] !== "v1") {
        return { valid: false, reason: "malformed token" };
    }

    const [, tsStr, expStr, userIdStr, sig] = parts;
    const ts = parseInt(tsStr, 10);
    const exp = parseInt(expStr, 10);
    const userId = parseInt(userIdStr, 10);

    if (isNaN(ts) || isNaN(exp) || isNaN(userId)) {
        return { valid: false, reason: "invalid token fields" };
    }

    if (Date.now() > exp) {
        return { valid: false, reason: "proof expired" };
    }

    const payload = [
        ts,
        exp,
        params.network,
        params.recipient,
        canonical(params.amount),
        userId,
    ].join(":");
    const expected = createHmac("sha256", X402_SECRET!).update(payload).digest("hex");

    if (sig !== expected) {
        return { valid: false, reason: "invalid signature" };
    }

    return { valid: true, userId };
}
