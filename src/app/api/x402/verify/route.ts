import { NextRequest, NextResponse } from "next/server";
import { verifyX402Proof } from "@/lib/x402";

export const dynamic = "force-dynamic";

/**
 * GET /api/x402/verify
 *
 * Public endpoint for external APIs to verify an Aporto x402 proof token.
 * No authentication required — the proof itself is the credential.
 *
 * Query params:
 *   proof     — the X-Payment-Proof token from the request header
 *   network   — must be "aporto"
 *   recipient — the recipient identifier (must match what was paid for)
 *   amount    — the amount (must match what was paid for)
 *
 * Response:
 *   200 { valid: true, userId: number }
 *   200 { valid: false, reason: string }
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const proof = searchParams.get("proof") ?? "";
    const network = searchParams.get("network") ?? "";
    const recipient = searchParams.get("recipient") ?? "";
    const amount = searchParams.get("amount") ?? "";

    if (!proof || !network || !recipient || !amount) {
        return NextResponse.json(
            { valid: false, reason: "Missing required query params: proof, network, recipient, amount" },
            { status: 400 }
        );
    }

    const result = verifyX402Proof(proof, { network, recipient, amount });

    return NextResponse.json(result);
}
