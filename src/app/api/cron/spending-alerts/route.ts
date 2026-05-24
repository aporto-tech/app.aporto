import { NextResponse } from "next/server";
import { runSpendingAlerts } from "@/lib/spending-alerts";

async function handleSpendingAlertsCron(req: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        console.error("[cron/spending-alerts] CRON_SECRET is not configured");
        return NextResponse.json({ success: false, message: "Cron secret is not configured" }, { status: 500 });
    }

    if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await runSpendingAlerts();
        return NextResponse.json({ success: true, ...result });
    } catch (err) {
        console.error("[cron/spending-alerts] Error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    return handleSpendingAlertsCron(req);
}

export async function POST(req: Request) {
    return handleSpendingAlertsCron(req);
}
