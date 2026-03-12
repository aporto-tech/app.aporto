import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || "";
const NOWPAYMENTS_API_URL = "https://api.nowpayments.io/v1/invoice";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        
        if (!userId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { amount, packageId } = body;

        if (!amount || amount <= 0) {
            return NextResponse.json({ success: false, message: "Invalid amount" }, { status: 400 });
        }

        if (!NOWPAYMENTS_API_KEY) {
            return NextResponse.json({ success: false, message: "Server misconfiguration. NOWPayments API Key missing." }, { status: 500 });
        }

        const baseUrl = process.env.NEXTAUTH_URL || `http://${req.headers.get("host")}`;

        const payload = {
            price_amount: amount,
            price_currency: "usd",
            order_id: `${userId}_${Date.now()}_${packageId}`,
            order_description: `Add Funds - Package ${packageId} for user ${userId}`,
            ipn_callback_url: `${baseUrl}/api/webhooks/nowpayments`,
            success_url: `${baseUrl}/dashboard?payment=success`,
            cancel_url: `${baseUrl}/dashboard?payment=cancelled`,
        };

        const response = await fetch(NOWPAYMENTS_API_URL, {
            method: "POST",
            headers: {
                "x-api-key": NOWPAYMENTS_API_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.invoice_url) {
            return NextResponse.json({
                success: true,
                invoiceUrl: data.invoice_url
            });
        } else {
            console.error("NOWPayments Error:", data);
            return NextResponse.json({ success: false, message: "Failed to create invoice from payment provider." }, { status: response.status });
        }

    } catch (err) {
        console.error("NOWPayments exception:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
