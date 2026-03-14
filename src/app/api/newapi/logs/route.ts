import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { newApiGetLogs } from "@/lib/newapi";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || !(session.user as any).newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const newApiUserId = (session.user as any).newApiUserId;

        // Extract pagination and filter params from request
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '0', 10);
        const size = parseInt(searchParams.get('size') || '20', 10);
        const model_name = searchParams.get('model_name') || undefined;
        const token_name = searchParams.get('token_name') || undefined;
        const log_type = searchParams.get('log_type') || undefined;
        const start_date = searchParams.get('start_date') ? parseInt(searchParams.get('start_date')!, 10) : undefined;
        const end_date = searchParams.get('end_date') ? parseInt(searchParams.get('end_date')!, 10) : undefined;

        const { logs, total } = await newApiGetLogs({
            userId: Number(newApiUserId),
            page,
            size,
            model_name,
            token_name,
            log_type,
            start_date,
            end_date
        });

        // New-API stores quota in "credits" where 500000 = $1 USD. We convert the `quota` field to USD format.
        const QUOTA_PER_DOLLAR = 500000;
        
        const formattedItems = logs.map(item => ({
            ...item,
            costUSD: item.quota / QUOTA_PER_DOLLAR
        }));

        return NextResponse.json({
            success: true,
            logs: formattedItems,
            total: total,
            page: page,
            pageSize: size
        });

    } catch (error) {
        console.error("[logs] Error:", error);
        return NextResponse.json(
            { success: false, message: String(error) },
            { status: 500 }
        );
    }
}
