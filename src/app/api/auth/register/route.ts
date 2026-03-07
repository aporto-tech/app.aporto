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

        // Create user in New-API (blocking to get the ID)
        const username = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
        const newApiUser = await newApiCreateUser({
            username: `${username}_${Math.random().toString(36).substr(2, 6)}`,
            email,
            password, // plain password — New-API hashes it internally
        });

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
