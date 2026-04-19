import { NextResponse } from "next/server";
import crypto from "crypto";
import { safeTopUp } from "@/lib/topup";
import { prisma } from "@/lib/prisma";
import { trackServerEvent } from "@/lib/mixpanel-server";

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || "";

export async function POST(req: Request) {
    try {
        const bodyText = await req.text();
        const signature = req.headers.get("x-nowpayments-sig");

        console.log("NOWPayments IPN received. Signature:", signature ? "present" : "MISSING");
        console.log("NOWPayments IPN body:", bodyText.slice(0, 500));

        if (!signature || !NOWPAYMENTS_IPN_SECRET) {
            console.error("NOWPayments IPN: missing signature or IPN secret not configured");
            return NextResponse.json({ success: false, message: "Missing IPN secret or signature" }, { status: 400 });
        }

        // Verify HMAC-SHA512 signature
        const hmac = crypto.createHmac("sha512", NOWPAYMENTS_IPN_SECRET);
        // NOWPayments signs the JSON body with keys sorted alphabetically
        const parsed = JSON.parse(bodyText);
        const sortedBody = JSON.stringify(
            Object.keys(parsed).sort().reduce<Record<string, unknown>>((acc, k) => {
                acc[k] = parsed[k];
                return acc;
            }, {})
        );
        hmac.update(sortedBody);
        const calculatedSignature = hmac.digest("hex");

        if (calculatedSignature !== signature) {
            console.error("NOWPayments IPN: invalid signature. Got:", signature, "Expected:", calculatedSignature);
            return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 403 });
        }

        console.log("NOWPayments IPN: signature valid");

        // order_id format: {newApiUserId}_{timestamp}_{packageId}
        const { payment_status, price_amount, order_id } = parsed;

        // Only process "finished" — NOWPayments also sends "confirmed" before it,
        // and processing both would double-credit the user.
        if (payment_status === "finished") {
            const [rawUserId] = String(order_id).split("_");
            const newApiUserId = parseInt(rawUserId, 10);
            const usdAmount = Number(price_amount);

            if (!newApiUserId || isNaN(newApiUserId)) {
                console.error("NOWPayments IPN: cannot parse newApiUserId from order_id", order_id);
                return NextResponse.json({ success: false, message: "Bad order_id" }, { status: 400 });
            }

            console.log(`NOWPayments: payment ${payment_status} — user ${newApiUserId}, $${usdAmount}`);

            // safeTopUp inserts the TopUpTransaction row FIRST, then credits quota.
            // Returns false if orderId already processed (idempotent).
            const credited = await safeTopUp(String(order_id), newApiUserId, usdAmount);
            console.log(`NOWPayments: order ${order_id} — ${credited ? "quota credited" : "duplicate event, skipped"}`);

            if (credited) {
                const dbUser = await prisma.user.findFirst({ where: { newApiUserId }, select: { id: true } });
                if (dbUser) {
                    await trackServerEvent(dbUser.id, "payment_completed", {
                        method: "crypto",
                        amount_usd: usdAmount,
                    });
                }
            }

            return NextResponse.json({ success: true, message: credited ? "Balance updated" : "Already processed" });
        }

        // Other statuses (waiting, confirming, partially_paid, etc.) — just acknowledge
        return NextResponse.json({ success: true, message: "Webhook received" });

    } catch (err) {
        console.error("NOWPayments Webhook Error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
