import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend } from "@/lib/resend";
import { upsertOtp, OTP_TTL_MS, OTP_RESEND_COOLDOWN_MS } from "@/lib/otp";

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email },
            select: { emailVerified: true },
        });

        // Silent response if user not found — prevents email enumeration.
        if (!user) {
            return NextResponse.json({ sent: true }, { status: 200 });
        }

        if (user.emailVerified) {
            return NextResponse.json({ alreadyVerified: true }, { status: 200 });
        }

        // Rate-limit: derive token creation time from expires - TTL.
        // This avoids storing createdAt separately while keeping the math
        // stable as long as OTP_TTL_MS is the same constant used to create the token.
        const existing = await prisma.verificationToken.findFirst({
            where: { identifier: email },
        });

        if (existing) {
            const createdAt = new Date(existing.expires.getTime() - OTP_TTL_MS);
            const elapsedMs = Date.now() - createdAt.getTime();
            if (elapsedMs < OTP_RESEND_COOLDOWN_MS) {
                const retryAfterSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000);
                return NextResponse.json(
                    { error: "Please wait before requesting a new code", retryAfter: retryAfterSec },
                    { status: 429 }
                );
            }
        }

        const otp = await upsertOtp(email);

        await getResend().emails.send({
            from: process.env.EMAIL_FROM as string,
            to: email,
            subject: "Your Aporto verification code",
            text: `Your new Aporto verification code: ${otp}\n\nThis code expires in 15 minutes.`,
        });

        return NextResponse.json({ sent: true }, { status: 200 });
    } catch (error) {
        console.error("[resend-otp] error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
