import { NextRequest, NextResponse } from "next/server";
import { newApiCreateToken } from "@/lib/newapi";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

/**
 * POST /api/newapi/create-key
 *
 * Creates an API token in New-API on behalf of the current user.
 * Body: { name: string }
 * Returns: { success: boolean, key?: string, message?: string }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user || !(session.user as any).newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const newApiUserId = (session.user as any).newApiUserId;

        const body = await req.json();
        const { name } = body as { name: string };

        if (!name?.trim()) {
            return NextResponse.json(
                { success: false, message: "Key name is required." },
                { status: 400 }
            );
        }

        const notConfigured = !process.env.NEWAPI_URL || !process.env.NEWAPI_ADMIN_TOKEN ||
            process.env.NEWAPI_ADMIN_TOKEN === "changeme_after_first_boot";

        if (notConfigured) {
            return NextResponse.json(
                {
                    success: false,
                    message: "NEWAPI_ADMIN_TOKEN is not configured. Open http://localhost:3002 → get admin token → add to .env.local → restart app.",
                },
                { status: 500 }
            );
        }

        const token = await newApiCreateToken({ name: name.trim(), userId: Number(newApiUserId) });

        if (!token?.key) {
            return NextResponse.json(
                { success: false, message: "New-API returned no key. Check container logs: docker compose logs new-api" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, key: token.key });
    } catch (error) {
        console.error("[create-key] Error:", error);
        return NextResponse.json(
            { success: false, message: String(error) },
            { status: 500 }
        );
    }
}
