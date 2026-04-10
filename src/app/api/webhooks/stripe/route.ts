import { NextResponse } from "next/server";
import Stripe from "stripe";
import { safeTopUp } from "@/lib/topup";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(req: Request) {
    try {
        // Must call req.text() BEFORE any other body consumption.
        // Next.js App Router exposes a ReadableStream that can only be consumed once.
        // Stripe's constructEvent requires the raw body string to verify the signature.
        const body = await req.text();
        const sig = req.headers.get("stripe-signature");

        console.log("Stripe webhook received. Signature:", sig ? "present" : "MISSING");

        if (!sig || !STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
            console.error("Stripe webhook: missing signature or secrets not configured");
            return NextResponse.json({ success: false, message: "Missing signature or secret" }, { status: 400 });
        }

        // Initialize Stripe lazily to avoid build-time errors when env var is not set
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            console.error("Stripe webhook: invalid signature.", err);
            return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 400 });
        }

        console.log("Stripe webhook: signature valid. Event type:", event.type);

        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;

            // Stripe metadata values are always strings — parseInt can return NaN if missing.
            const newApiUserId = parseInt(session.metadata?.newApiUserId ?? "", 10);
            const usdAmount = (session.amount_total ?? 0) / 100;
            // Stripe charges 2.9% + $0.30 per transaction. Aporto only receives the net.
            // Quota is credited on what we actually receive, not the gross amount the user paid.
            const netUsd = Math.max(0, usdAmount * (1 - 0.029) - 0.30);
            const packageId = session.metadata?.packageId ?? undefined;

            if (!newApiUserId || isNaN(newApiUserId)) {
                console.error("Stripe webhook: cannot parse newApiUserId from metadata", session.id, session.metadata);
                return NextResponse.json({ success: false, message: "Bad metadata" }, { status: 400 });
            }

            console.log(`Stripe: checkout.session.completed — session ${session.id}, user ${newApiUserId}, $${usdAmount}`);

            // safeTopUp inserts the TopUpTransaction row FIRST, then credits quota.
            // If the row already exists (Stripe retry or duplicate event), returns false — no double-credit.
            const credited = await safeTopUp(session.id, newApiUserId, usdAmount, packageId, netUsd);
            console.log(`Stripe: session ${session.id} — ${credited ? "quota credited" : "duplicate event, skipped"}`);

            return NextResponse.json({ success: true, message: credited ? "Balance updated" : "Already processed" });
        }

        if (event.type === "payment_intent.succeeded") {
            const pi = event.data.object as Stripe.PaymentIntent;
            // Only handle saved-card payments (checkout sessions are handled via checkout.session.completed)
            if (pi.metadata?.source === "saved_card") {
                const newApiUserId = parseInt(pi.metadata?.newApiUserId ?? "", 10);
                if (!newApiUserId || isNaN(newApiUserId)) {
                    console.error("Stripe webhook: cannot parse newApiUserId from PI metadata", pi.id, pi.metadata);
                    return NextResponse.json({ success: false, message: "Bad metadata" }, { status: 400 });
                }
                const usdAmount = pi.amount / 100;
                const netUsd = Math.max(0, usdAmount * (1 - 0.029) - 0.30);
                const credited = await safeTopUp(pi.id, newApiUserId, usdAmount, "saved_card", netUsd);
                console.log(`Stripe PI ${pi.id} — ${credited ? "quota credited" : "duplicate event, skipped"}`);
            }
            return NextResponse.json({ success: true, message: "Webhook received" });
        }

        // Other event types — acknowledge and ignore
        return NextResponse.json({ success: true, message: "Webhook received" });

    } catch (err) {
        console.error("Stripe webhook error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
