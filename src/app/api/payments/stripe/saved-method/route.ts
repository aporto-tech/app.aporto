import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;

        if (!userId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
        }

        if (!user.stripePaymentMethodId) {
            return NextResponse.json({ success: true, hasSavedCard: false });
        }

        return NextResponse.json({
            success: true,
            hasSavedCard: true,
            brand: user.stripePaymentMethodBrand,
            last4: user.stripePaymentMethodLast4,
            expiry: user.stripePaymentMethodExpiry,
        });
    } catch (err) {
        console.error("saved-method GET error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE() {
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

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.stripePaymentMethodId) {
            return NextResponse.json({ success: true }); // already removed
        }

        await stripe.paymentMethods.detach(user.stripePaymentMethodId);

        await prisma.user.update({
            where: { id: userId },
            data: {
                stripePaymentMethodId: null,
                stripePaymentMethodBrand: null,
                stripePaymentMethodLast4: null,
                stripePaymentMethodExpiry: null,
            },
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("saved-method DELETE error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
