import { NextRequest, NextResponse } from "next/server";
import { pollDueSkillRuns } from "@/lib/skillRuns";

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function POST(req: NextRequest) {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { searchParams } = req.nextUrl;
        const result = await pollDueSkillRuns({
            limit: parsePositiveInt(searchParams.get("limit"), 10),
            maxWaitSecondsPerRun: parsePositiveInt(searchParams.get("maxWaitSecondsPerRun"), 5),
            internalBaseUrl: req.nextUrl.origin,
        });

        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error("[cron/skill-runs/poll] Error:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
