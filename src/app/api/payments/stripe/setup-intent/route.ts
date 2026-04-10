import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export async function POST() {
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
        if (!user) {
            return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
        }

        let stripeCustomerId = user.stripeCustomerId;

        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: user.email ?? undefined,
                metadata: { userId },
            });
            stripeCustomerId = customer.id;
            await prisma.user.update({
                where: { id: userId },
                data: { stripeCustomerId },
            });
        }

        const setupIntent = await stripe.setupIntents.create({
            customer: stripeCustomerId,
            usage: "off_session",
        });

        return NextResponse.json({ success: true, clientSecret: setupIntent.client_secret });
    } catch (err) {
        console.error("setup-intent error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
