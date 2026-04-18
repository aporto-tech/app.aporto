import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newApiCreateUser, newApiGrantWelcomeBonus } from "@/lib/newapi";
import { sendWelcomeEmail } from "@/lib/emails";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    try {
        const { email, code } = await req.json();

        if (!email || !code) {
            return NextResponse.json(
                { error: "Email and code are required" },
                { status: 400 }
            );
        }

        // Always filter by BOTH email and code to prevent cross-user OTP lookup attacks.
        const token = await prisma.verificationToken.findFirst({
            where: { identifier: email, token: code },
        });

        if (!token) {
            console.warn(`[verify-email] invalid code attempt for ${email}`);
            return NextResponse.json(
                { error: "Invalid code" },
                { status: 422 }
            );
        }

        if (token.expires < new Date()) {
            return NextResponse.json(
                { error: "Code expired — request a new one" },
                { status: 410 }
            );
        }

        // Look up user for lead payload and idempotency check.
        const user = await prisma.user.findUnique({
            where: { email },
            select: { name: true, emailVerified: true },
        });

        if (user?.emailVerified) {
            // Idempotent: already verified (e.g. double submit)
            return NextResponse.json({ alreadyVerified: true }, { status: 200 });
        }

        // Mark email as verified and delete the used token in one transaction.
        await prisma.$transaction([
            prisma.verificationToken.deleteMany({ where: { identifier: email } }),
            prisma.user.update({
                where: { email },
                data: { emailVerified: new Date() },
            }),
        ]);

        // Create New-API user synchronously so newApiUserId is set in the DB
        // before the client calls signIn() and the JWT is built.
        // New-API strictly requires username <= 16 characters.
        let baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
        if (baseUsername.length > 9) baseUsername = baseUsername.substring(0, 9);
        const suffix = crypto.randomBytes(3).toString("hex"); // 6 hex chars
        const username = `${baseUsername}_${suffix}`;

        // Password users never log into New-API directly — only Aporto authenticates them.
        const newApiPassword = crypto.randomBytes(8).toString("hex") + "Aa1!";

        const newApiUser = await newApiCreateUser({ username, email, password: newApiPassword });
        if (newApiUser) {
            await prisma.user.update({
                where: { email },
                data: { newApiUserId: newApiUser.id },
            });
            console.log(`[verify-email] New-API user created: id=${newApiUser.id} for ${email}`);

            // Grant $3 welcome bonus (1,500,000 quota units).
            const bonusGranted = await newApiGrantWelcomeBonus(newApiUser.id);
            console.log(`[verify-email] Welcome bonus ${bonusGranted ? "granted" : "FAILED"} for New-API user ${newApiUser.id}`);
        } else {
            console.error(`[verify-email] WARNING: New-API user creation FAILED for ${email}`);
        }

        // Fire welcome email — fire-and-forget, never blocks response.
        void sendWelcomeEmail(email, user?.name ?? null).catch(
            (e) => console.error("[verify-email] welcome email failed:", e)
        );

        // Fire Bitrix24 lead — fire-and-forget (no session dependency).
        const bitrixWebhook = process.env.BITRIX24_LEAD_WEBHOOK;
        if (bitrixWebhook) {
            void fetch(`${bitrixWebhook}crm.lead.add.json`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fields: {
                        TITLE: "New Registration",
                        NAME: user?.name ?? email,
                        EMAIL: [{ VALUE: email, TYPE: "WORK" }],
                        SOURCE_ID: "WEB",
                        SOURCE_DESCRIPTION: "aporto.tech",
                    },
                }),
            }).catch((e) => console.error("[bitrix24] lead creation failed:", e));
        }

        // Client will call signIn('credentials', { email, password }) and router.push('/dashboard')
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("[verify-email] error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
