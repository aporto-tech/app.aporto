import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession } from "@/lib/serviceProxy";
import { getSkillRun } from "@/lib/skillRuns";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function readRun(req: NextRequest, id: string, body?: Record<string, unknown>) {
    const auth = await validateApiKeyOrSession(req);
    if (!auth) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const result = await getSkillRun({
        source: "rest",
        newApiUserId: auth.newApiUserId,
        runId: id,
        waitForResult: body?.waitForResult !== false,
        maxWaitSeconds: Number(body?.maxWaitSeconds ?? 45) || 45,
        internalBaseUrl: req.nextUrl.origin,
    });

    if (!result) {
        return NextResponse.json({ success: false, message: "Skill run not found" }, { status: 404 });
    }

    return NextResponse.json({ success: result.status !== "failed", ...result }, {
        status: result.status === "failed" ? 502 : 200,
    });
}

export async function GET(req: NextRequest, { params }: Params) {
    const { id } = await params;
    const waitForResult = req.nextUrl.searchParams.get("waitForResult") !== "false";
    const maxWaitSeconds = Number(req.nextUrl.searchParams.get("maxWaitSeconds") ?? 45) || 45;
    return readRun(req, id, { waitForResult, maxWaitSeconds });
}

export async function POST(req: NextRequest, { params }: Params) {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return readRun(req, id, body);
}
