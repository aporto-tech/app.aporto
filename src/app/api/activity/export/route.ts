import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { newApiGetLogs } from "@/lib/newapi";

export const dynamic = "force-dynamic";

const QUOTA_PER_DOLLAR = 500_000;

function escapeCsv(value: string | number): string {
    const str = String(value ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || !(session.user as any).newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const newApiUserId = Number((session.user as any).newApiUserId);
        const { searchParams } = new URL(req.url);
        const model_name = searchParams.get("model_name") ?? undefined;
        const token_name = searchParams.get("token_name") ?? undefined;
        const log_type = searchParams.get("log_type") ?? undefined;
        const start_date = searchParams.get("start_date") ? parseInt(searchParams.get("start_date")!, 10) : undefined;
        const end_date = searchParams.get("end_date") ? parseInt(searchParams.get("end_date")!, 10) : undefined;

        // Fetch up to 10,000 rows (no pagination)
        const { logs } = await newApiGetLogs({
            userId: newApiUserId,
            page: 0,
            size: 10_000,
            model_name,
            token_name,
            log_type,
            start_date,
            end_date,
        });

        const header = ["Time", "Agent (API Key)", "Type", "Amount (USD)", "Tokens In", "Tokens Out", "Model", "Details"];
        const rows = logs.map(log => {
            const time = new Date(log.created_at * 1000).toISOString();
            const isError = log.type === 2 && log.content !== "";
            const isConsume = log.type === 2 && !isError;
            const typeStr = isError ? "Error" : isConsume ? "Consume" : log.type === 1 ? "Top-up" : "Other";
            const costUSD = (log.quota / QUOTA_PER_DOLLAR).toFixed(6);
            return [
                escapeCsv(time),
                escapeCsv(log.token_name),
                escapeCsv(typeStr),
                escapeCsv(costUSD),
                escapeCsv(log.prompt_tokens),
                escapeCsv(log.completion_tokens),
                escapeCsv(log.model_name),
                escapeCsv(log.content),
            ].join(",");
        });

        const csv = [header.join(","), ...rows].join("\n");
        const date = new Date().toISOString().slice(0, 10);

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="aporto-activity-${date}.csv"`,
            },
        });
    } catch (err) {
        console.error("[activity/export] Error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
