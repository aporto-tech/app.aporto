import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { safeTopUp } from "@/lib/topup";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        const newApiUserId = (session?.user as any)?.newApiUserId;

        if (!userId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        if (!process.env.STRIPE_SECRET_KEY) {
            return NextResponse.json({ success: false, message: "Payment service not configured." }, { status: 500 });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

        const body = await req.json();
        const { paymentIntentId } = body;

        if (!paymentIntentId) {
            return NextResponse.json({ success: false, message: "Missing paymentIntentId." }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.stripeCustomerId) {
            return NextResponse.json({ success: false, message: "No Stripe customer found." }, { status: 400 });
        }

        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

        // Security: verify this PI belongs to the authenticated user's customer
        if (pi.customer !== user.stripeCustomerId) {
            return NextResponse.json({ success: false, message: "Payment intent does not belong to your account." }, { status: 403 });
        }

        if (pi.status !== "succeeded") {
            return NextResponse.json({ success: false, message: `Payment not completed. Status: ${pi.status}` }, { status: 400 });
        }

        const usdAmount = pi.amount / 100;
        const netUsd = Math.max(0, usdAmount * (1 - 0.029) - 0.30);
        const effectiveNewApiUserId = newApiUserId ?? parseInt(pi.metadata?.newApiUserId ?? "", 10);

        if (!effectiveNewApiUserId || isNaN(effectiveNewApiUserId)) {
            return NextResponse.json({ success: false, message: "Cannot resolve user ID." }, { status: 400 });
        }

        const credited = await safeTopUp(pi.id, effectiveNewApiUserId, usdAmount, "saved_card", netUsd);

        return NextResponse.json({ success: true, credited });
    } catch (err) {
        console.error("charge-saved/confirm error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
