import { NextRequest, NextResponse } from "next/server";
import { pollDueSkillRuns } from "@/lib/skillRuns";
import { deliverDueTelegramSkillRuns } from "@/lib/telegramDelivery";
import { deleteExpiredThreads } from "@/lib/skillThread";

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
        const telegram = await deliverDueTelegramSkillRuns({
            limit: parsePositiveInt(searchParams.get("telegramLimit"), 20),
            internalBaseUrl: req.nextUrl.origin,
        });

        await deleteExpiredThreads().catch(() => {});

        return NextResponse.json({ success: true, ...result, telegram });
    } catch (error) {
        console.error("[cron/skill-runs/poll] Error:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
