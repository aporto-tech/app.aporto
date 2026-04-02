import { NextResponse } from "next/server";
import crypto from "crypto";

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || "";
const NEWAPI_ADMIN_TOKEN = process.env.NEWAPI_ADMIN_TOKEN || "";
const NEWAPI_URL = process.env.NEWAPI_URL || "https://api.aporto.tech";

// 1 USD = 500,000 quota units in New-API
const QUOTA_PER_USD = 500_000;

async function topUpUserQuota(newApiUserId: number, usdAmount: number) {
    const adminHeaders = {
        "Authorization": `Bearer ${NEWAPI_ADMIN_TOKEN}`,
        "New-Api-User": "1",
    };

    // Fetch current user quota
    const userRes = await fetch(`${NEWAPI_URL}/api/user/${newApiUserId}`, {
        headers: adminHeaders,
        cache: "no-store",
    });

    if (!userRes.ok) {
        const errText = await userRes.text();
        throw new Error(`Failed to fetch user ${newApiUserId}: ${userRes.status} — ${errText}`);
    }

    const userData = await userRes.json();
    console.log(`NOWPayments: fetched user ${newApiUserId} data:`, JSON.stringify(userData));

    const currentQuota: number = userData.data?.quota ?? 0;
    const addQuota = Math.floor(usdAmount * QUOTA_PER_USD);
    const newQuota = currentQuota + addQuota;

    console.log(`NOWPayments: quota update — current: ${currentQuota}, adding: ${addQuota}, new: ${newQuota}`);

    // Update quota
    const updateRes = await fetch(`${NEWAPI_URL}/api/user/`, {
        method: "PUT",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ id: newApiUserId, quota: newQuota }),
    });

    if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Failed to update quota for user ${newApiUserId}: ${errText}`);
    }

    const updateData = await updateRes.json();
    if (!updateData.success) {
        throw new Error(`New-API rejected quota update: ${updateData.message}`);
    }

    return { added: addQuota, newQuota };
}

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

        if (payment_status === "finished" || payment_status === "confirmed") {
            const [rawUserId] = String(order_id).split("_");
            const newApiUserId = parseInt(rawUserId, 10);
            const usdAmount = Number(price_amount);

            if (!newApiUserId || isNaN(newApiUserId)) {
                console.error("NOWPayments IPN: cannot parse newApiUserId from order_id", order_id);
                return NextResponse.json({ success: false, message: "Bad order_id" }, { status: 400 });
            }

            console.log(`NOWPayments: payment ${payment_status} — user ${newApiUserId}, $${usdAmount}`);

            const result = await topUpUserQuota(newApiUserId, usdAmount);
            console.log(`NOWPayments: topped up user ${newApiUserId} by ${result.added} quota (new total: ${result.newQuota})`);

            return NextResponse.json({ success: true, message: "Balance updated" });
        }

        // Other statuses (waiting, confirming, partially_paid, etc.) — just acknowledge
        return NextResponse.json({ success: true, message: "Webhook received" });

    } catch (err) {
        console.error("NOWPayments Webhook Error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
