import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;

        if (!userId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        if (!process.env.STRIPE_SECRET_KEY) {
            return NextResponse.json({ success: false, message: "Payment service not configured." }, { status: 500 });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

        const body = await req.json();
        const { paymentMethodId } = body;

        if (!paymentMethodId) {
            return NextResponse.json({ success: false, message: "Missing paymentMethodId." }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.stripeCustomerId) {
            return NextResponse.json({ success: false, message: "No Stripe customer found." }, { status: 400 });
        }

        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

        // Verify this PM belongs to our customer
        if (pm.customer !== user.stripeCustomerId) {
            return NextResponse.json({ success: false, message: "Payment method not attached to your account." }, { status: 403 });
        }

        const card = pm.card;
        const brand = card?.brand ?? "";
        const last4 = card?.last4 ?? "";
        const expiry = card ? `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}` : "";

        await prisma.user.update({
            where: { id: userId },
            data: {
                stripePaymentMethodId: paymentMethodId,
                stripePaymentMethodBrand: brand,
                stripePaymentMethodLast4: last4,
                stripePaymentMethodExpiry: expiry,
            },
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("save-method error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
