import { NextResponse } from "next/server";
import crypto from "crypto";

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || "";

// New-API admin token for potential balance addition
const NEWAPI_ADMIN_TOKEN = process.env.NEWAPI_ADMIN_TOKEN || "";
const NEWAPI_URL = process.env.NEWAPI_URL || "http://localhost:3000";

export async function POST(req: Request) {
    try {
        const bodyText = await req.text();
        const signature = req.headers.get("x-nowpayments-sig");

        if (!signature || !NOWPAYMENTS_IPN_SECRET) {
            return NextResponse.json({ success: false, message: "Missing IPN secret or signature" }, { status: 400 });
        }

        // Verify HMAC signature
        const hmac = crypto.createHmac("sha512", NOWPAYMENTS_IPN_SECRET);
        hmac.update(bodyText);
        const calculatedSignature = hmac.digest("hex");

        if (calculatedSignature !== signature) {
            return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 403 });
        }

        const payload = JSON.parse(bodyText);
        
        // NOWPayments payload has payment_status, price_amount, order_id (which we set to {userId}_{timestamp}_{pkgId})
        if (payload.payment_status === "finished") {
            const usdAmount = payload.price_amount; // amount they paid in USD
            const orderId = payload.order_id;       // e.g. "clxq1234_1700000_pkg_50"
            const [userId] = orderId.split("_");

            console.log(`Payment confirmed for User: ${userId}, Amount: $${usdAmount}`);

            // TODO: Update user balance in database or via New-API.
            // In Aporto / New-API architecture, users typically have quota in `users` table or `tokens`.
            // Example of a hypothetical top-up endpoint for New-API:
            /*
            await fetch(`${NEWAPI_URL}/api/user/topup`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${NEWAPI_ADMIN_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    id: parseInt(userId, 10),
                    quota: usdAmount * 500000 // If 1 USD = 500,000 quota
                })
            });
            */
            
            // For now, this just acknowledges the IPN successfully
            return NextResponse.json({ success: true, message: "Payment processed" });
        }

        // For other statuses (waiting, confirming, etc), just acknowledge
        return NextResponse.json({ success: true, message: "Webhook received" });
        
    } catch (err) {
        console.error("NOWPayments Webhook Error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
