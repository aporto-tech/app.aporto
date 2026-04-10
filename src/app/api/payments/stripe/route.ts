import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import Stripe from "stripe";

const STRIPE_MIN_AMOUNT = 5; // $5 minimum — Stripe fee (2.9% + $0.30) makes sub-$5 economically negative

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        const newApiUserId = (session?.user as any)?.newApiUserId;

        if (!userId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { amount, packageId } = body;

        if (!amount || amount < STRIPE_MIN_AMOUNT) {
            return NextResponse.json(
                { success: false, message: `Minimum card payment is $${STRIPE_MIN_AMOUNT}.` },
                { status: 400 },
            );
        }

        if (!process.env.STRIPE_SECRET_KEY) {
            return NextResponse.json({ success: false, message: "Payment service not configured." }, { status: 500 });
        }

        // Initialize Stripe lazily to avoid build-time errors when env var is not set
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

        const baseUrl = process.env.NEXTAUTH_URL || `https://${req.headers.get("host")}`;

        const checkoutSession = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `Add Funds $${amount} — Aporto`,
                        },
                        // Stripe requires integer cents. Use Math.round to avoid float precision issues.
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            metadata: {
                newApiUserId: String(newApiUserId ?? userId),
                packageId: String(packageId ?? "custom"),
            },
            success_url: `${baseUrl}/dashboard?payment=success`,
            cancel_url: `${baseUrl}/dashboard?payment=cancelled`,
        });

        if (!checkoutSession.url) {
            return NextResponse.json({ success: false, message: "Failed to create checkout session." }, { status: 500 });
        }

        return NextResponse.json({ success: true, checkoutUrl: checkoutSession.url });
    } catch (err) {
        console.error("Stripe checkout error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
