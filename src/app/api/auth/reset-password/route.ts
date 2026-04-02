import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();
        console.log("PasswordReset: request for email:", email);

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            console.log("PasswordReset: user not found for email:", email);
            // For security reasons, don't reveal if user exists
            return NextResponse.json({ message: "If an account exists, a reset email has been sent" });
        }

        console.log("PasswordReset: user found, id:", user.id, "emailVerified:", user.emailVerified);

        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 3600000); // 1 hour

        await prisma.passwordResetToken.create({
            data: {
                email,
                token,
                expires,
            },
        });

        console.log("PasswordReset: token created, expires:", expires);

        const resetLink = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
        console.log("PasswordReset: sending email to:", email, "link:", resetLink);

        const sendResult = await resend.emails.send({
            from: "Aporto <noreply@aporto.tech>",
            to: email,
            subject: "Reset your password",
            html: `<p>Click the link below to reset your password:</p><a href="${resetLink}">${resetLink}</a>`,
        });

        console.log("PasswordReset: email send result:", JSON.stringify(sendResult));

        return NextResponse.json({ message: "If an account exists, a reset email has been sent" });
    } catch (error) {
        console.error("Password reset request error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
