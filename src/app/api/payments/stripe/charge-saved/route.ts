import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const STRIPE_MIN_AMOUNT = 5;

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
        const { amount } = body;

        if (!amount || amount < STRIPE_MIN_AMOUNT) {
            return NextResponse.json(
                { success: false, message: `Minimum card payment is $${STRIPE_MIN_AMOUNT}.` },
                { status: 400 },
            );
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.stripeCustomerId || !user?.stripePaymentMethodId) {
            return NextResponse.json({ success: false, message: "No saved card on file." }, { status: 400 });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: "usd",
            customer: user.stripeCustomerId,
            payment_method: user.stripePaymentMethodId,
            metadata: {
                newApiUserId: String(newApiUserId ?? userId),
                source: "saved_card",
            },
        });

        return NextResponse.json({ success: true, clientSecret: paymentIntent.client_secret });
    } catch (err) {
        console.error("charge-saved error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
