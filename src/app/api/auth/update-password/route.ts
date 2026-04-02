import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

export async function POST(req: NextRequest) {
    try {
        const { token, password } = await req.json();
        console.log("UpdatePassword: request with token present:", !!token, "password present:", !!password);

        if (!token || !password) {
            return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
        }

        const resetToken = await prisma.passwordResetToken.findUnique({
            where: { token },
        });

        console.log("UpdatePassword: token lookup result:", resetToken ? `found, expires: ${resetToken.expires}, email: ${resetToken.email}` : "NOT FOUND");

        if (!resetToken) {
            return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
        }

        if (resetToken.expires < new Date()) {
            console.log("UpdatePassword: token EXPIRED at", resetToken.expires, "now:", new Date());
            return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.user.update({
            where: { email: resetToken.email },
            data: { password: hashedPassword },
        });

        await prisma.passwordResetToken.delete({
            where: { token },
        });

        console.log("UpdatePassword: password updated successfully for", resetToken.email);
        return NextResponse.json({ message: "Password updated successfully" });
    } catch (error) {
        console.error("Password update error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
