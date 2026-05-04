import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { getResend } from "@/lib/resend";
import { upsertOtp } from "@/lib/otp";
import { getActiveProviderSkill } from "@/lib/providerAttribution";

export async function POST(req: NextRequest) {
    try {
        const { email, password, name, providerId, referralProviderId } = await req.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: "Email and password are required" },
                { status: 400 }
            );
        }

        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            if (existingUser.emailVerified !== null) {
                return NextResponse.json(
                    { error: "User already exists" },
                    { status: 400 }
                );
            }
            // Unverified user (e.g. abandoned OTP flow): delete and re-register cleanly.
            // onDelete: Cascade handles Account and Session rows.
            await prisma.user.delete({ where: { email } });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const pendingReferralProviderId = Number(providerId ?? referralProviderId) || null;
        const validReferral = pendingReferralProviderId
            ? await getActiveProviderSkill(pendingReferralProviderId)
            : null;

        // Create user with emailVerified: null — they must complete OTP before logging in.
        // New-API user creation is deferred to verify-email so newApiUserId is set
        // before the JWT is built on auto-login.
        await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                emailVerified: null,
                pendingReferralProviderId: validReferral ? pendingReferralProviderId : null,
            },
        });

        const otp = await upsertOtp(email);

        await getResend().emails.send({
            from: process.env.EMAIL_FROM as string,
            to: email,
            subject: "Your Aporto verification code",
            text: `Your Aporto verification code: ${otp}\n\nThis code expires in 15 minutes.`,
        });

        return NextResponse.json({ requiresVerification: true }, { status: 200 });
    } catch (error) {
        console.error("[register] error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
