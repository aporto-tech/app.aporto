import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession, deductUserQuota, logServiceUsage } from "@/lib/serviceProxy";
import { signX402Proof } from "@/lib/x402";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const auth = await validateApiKeyOrSession(req);
        if (!auth) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { network, recipient, amount } = body;

        if (!network || !recipient || !amount) {
            return NextResponse.json(
                { success: false, message: "Missing required fields: network, recipient, amount" },
                { status: 400 }
            );
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return NextResponse.json(
                { success: false, message: "Invalid amount" },
                { status: 400 }
            );
        }

        // Only support aporto network for now
        if (network !== "aporto") {
            return NextResponse.json(
                { success: false, message: `Unsupported payment network: ${network}` },
                { status: 400 }
            );
        }

        // Deduct from user's Aporto balance
        const balanceError = await deductUserQuota(auth.newApiUserId, parsedAmount);
        if (balanceError) return balanceError;

        // Sign proof token
        const proof = signX402Proof({
            network,
            recipient,
            amount,
            userId: auth.newApiUserId,
        });

        // Log for analytics
        void logServiceUsage(
            auth.newApiUserId,
            "x402",
            recipient,
            parsedAmount,
            { network, recipient, amount }
        ).catch((e) => console.error("[x402/pay] logServiceUsage failed:", e));

        return NextResponse.json({ success: true, proof });
    } catch (err) {
        console.error("[x402/pay] error:", err);
        return NextResponse.json({ success: false, message: "Internal error" }, { status: 500 });
    }
}
