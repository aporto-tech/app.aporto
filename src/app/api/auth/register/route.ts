import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { newApiCreateUser } from "@/lib/newapi";

export async function POST(req: NextRequest) {
    try {
        const { email, password, name } = await req.json();

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
            return NextResponse.json(
                { error: "User already exists" },
                { status: 400 }
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // New-API strictly requires username to be <= 16 characters.
        // We take the first 9 chars of the email prefix, plus '_' and a 6 char random string.
        let baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
        if (baseUsername.length > 9) baseUsername = baseUsername.substring(0, 9);
        const username = `${baseUsername}_${Math.random().toString(36).substr(2, 6)}`;

        // Generate a strong random password for the New-API account.
        // Users never log into New-API directly — they authenticate through Aporto only.
        // This avoids New-API's min/max password length validation failing on the user's actual password.
        const newApiPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + "!1";

        const newApiUser = await newApiCreateUser({
            username,
            email,
            password: newApiPassword,
        });

        if (!newApiUser) {
            // Log clearly for debugging — doesn't block user creation in Aporto DB
            console.error(`[register] WARNING: New-API user creation FAILED for ${email}. Check NEWAPI_URL=${process.env.NEWAPI_URL} and NEWAPI_ADMIN_TOKEN in server .env`);
        } else {
            console.log(`[register] New-API user created: id=${newApiUser.id} for ${email}`);
        }


        // Create user in local Prisma DB (for NextAuth)
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                newApiUserId: newApiUser?.id || null, // save the linked ID
            },
        });

        return NextResponse.json(
            { message: "User created successfully", userId: user.id },
            { status: 201 }
        );
    } catch (error) {
        console.error("Registration error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
