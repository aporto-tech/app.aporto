import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/newapi/logs?p=0&size=20&type=0&start_timestamp=&end_timestamp=
 *
 * Fetches request logs for the current user from New-API.
 * type: 0=all, 1=quota, 2=stream, 3=text
 */
export async function GET(req: NextRequest) {
    try {
        const newApiUrl = process.env.NEWAPI_URL;
        const adminToken = process.env.NEWAPI_ADMIN_TOKEN;

        if (!newApiUrl || !adminToken || adminToken === "changeme_after_first_boot") {
            return NextResponse.json({ success: false, message: "New-API not configured" }, { status: 500 });
        }

        const session = await getServerSession(authOptions);
        if (!session?.user || !(session.user as any).id) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const aportoUserId = (session.user as any).id as string;

        // Always read from DB to get the most up-to-date newApiUserId
        const dbUser = await prisma.user.findUnique({
            where: { id: aportoUserId },
            select: { newApiUserId: true },
        });

        const newApiUserId = dbUser?.newApiUserId ?? (session.user as any)?.newApiUserId;
        if (!newApiUserId) {
            return NextResponse.json({ success: false, message: "No NewAPI account linked" }, { status: 404 });
        }

        const searchParams = req.nextUrl.searchParams;
        const p = searchParams.get("p") ?? "0";
        const size = searchParams.get("size") ?? "20";
        const type = searchParams.get("type") ?? "0";
        const startTimestamp = searchParams.get("start_timestamp") ?? "";
        const endTimestamp = searchParams.get("end_timestamp") ?? "";
        const modelName = searchParams.get("model_name") ?? "";
        const tokenName = searchParams.get("token_name") ?? "";

        const params = new URLSearchParams({
            p,
            size,
            type,
            ...(startTimestamp && { start_timestamp: startTimestamp }),
            ...(endTimestamp && { end_timestamp: endTimestamp }),
            ...(modelName && { model_name: modelName }),
            ...(tokenName && { token_name: tokenName }),
        });

        const res = await fetch(`${newApiUrl}/api/log/self?${params.toString()}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${adminToken}`,
                "New-Api-User": String(newApiUserId),
            },
            cache: "no-store",
        });

        if (!res.ok) {
            return NextResponse.json({ success: false, message: `New-API error: ${res.status}` }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("[logs] Error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
