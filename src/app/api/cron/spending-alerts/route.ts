import { NextResponse } from "next/server";
import { runSpendingAlerts } from "@/lib/spending-alerts";

export async function POST(req: Request) {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
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
