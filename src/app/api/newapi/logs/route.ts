import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const newApiUrl = process.env.NEWAPI_URL;
        const adminToken = process.env.NEWAPI_ADMIN_TOKEN;

        if (!newApiUrl || !adminToken || adminToken === "changeme_after_first_boot") {
            return NextResponse.json(
                { success: false, message: "New-API not configured" },
                { status: 500 }
            );
        }

        const session = await getServerSession(authOptions);
        if (!session?.user || !(session.user as any).newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const newApiUserId = (session.user as any).newApiUserId;

        // Extract pagination params from request
        const { searchParams } = new URL(req.url);
        const page = searchParams.get('page') || '0';
        const size = searchParams.get('size') || '50';

        const res = await fetch(`${newApiUrl}/api/log/?p=${page}&size=${size}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${adminToken}`,
                "New-Api-User": String(newApiUserId),
            },
            cache: "no-store",
        });

        if (!res.ok) {
            return NextResponse.json(
                { success: false, message: `New-API error: ${res.status}` },
                { status: res.status }
            );
        }

        const data = await res.json() as {
            success: boolean;
            message?: string;
            data?: {
                items: any[];
                total: number;
                page: number;
                page_size: number;
            };
        };

        if (!data.success || !data.data) {
            return NextResponse.json(
                { success: false, message: data.message ?? "Failed to fetch logs" },
                { status: 500 }
            );
        }

        // New-API stores quota in "credits" where 500000 = $1 USD. We convert the `quota` field to USD format.
        const QUOTA_PER_DOLLAR = 500000;
        
        const formattedItems = (data.data.items || []).map(item => ({
            ...item,
            costUSD: item.quota / QUOTA_PER_DOLLAR
        }));

        return NextResponse.json({
            success: true,
            logs: formattedItems,
            total: data.data.total,
            page: data.data.page,
            pageSize: data.data.page_size
        });

    } catch (error) {
        console.error("[logs] Error:", error);
        return NextResponse.json(
            { success: false, message: String(error) },
            { status: 500 }
        );
    }
}
