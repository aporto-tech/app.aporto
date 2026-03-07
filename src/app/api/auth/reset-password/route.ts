import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            // For security reasons, don't reveal if user exists
            return NextResponse.json({ message: "If an account exists, a reset email has been sent" });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 3600000); // 1 hour

        await prisma.passwordResetToken.create({
            data: {
                email,
                token,
                expires,
            },
        });

        const resetLink = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;

        await resend.emails.send({
            from: "Aporto <noreply@aporto.tech>",
            to: email,
            subject: "Reset your password",
            html: `<p>Click the link below to reset your password:</p><a href="${resetLink}">${resetLink}</a>`,
        });

        return NextResponse.json({ message: "If an account exists, a reset email has been sent" });
    } catch (error) {
        console.error("Password reset request error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
