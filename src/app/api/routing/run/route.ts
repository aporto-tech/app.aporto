import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession } from "@/lib/serviceProxy";
import { DEFAULT_WAIT_SECONDS, runSkill } from "@/lib/skillRuns";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const auth = await validateApiKeyOrSession(req);
    if (!auth) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
        intent,
        params = {},
        skillId,
        providerHint,
        waitForResult = true,
        maxWaitSeconds = DEFAULT_WAIT_SECONDS,
        sessionId,
    } = body;

    if (!intent || typeof intent !== "string") {
        return NextResponse.json({ success: false, message: "Missing required field: intent" }, { status: 400 });
    }
    if (params !== null && (typeof params !== "object" || Array.isArray(params))) {
        return NextResponse.json({ success: false, message: "params must be a JSON object" }, { status: 400 });
    }
    if (skillId !== undefined && typeof skillId !== "number") {
        return NextResponse.json({ success: false, message: "skillId must be a number" }, { status: 400 });
    }

    try {
        const result = await runSkill({
            source: "rest",
            newApiUserId: auth.newApiUserId,
            authHeader: req.headers.get("authorization") ?? "",
            internalBaseUrl: req.nextUrl.origin,
            intent,
            params,
            skillId,
            providerHint,
            waitForResult: Boolean(waitForResult),
            maxWaitSeconds: Number(maxWaitSeconds) || DEFAULT_WAIT_SECONDS,
            sessionId,
        });

        return NextResponse.json({ success: result.status !== "failed", ...result }, {
            status: result.status === "failed" ? 502 : 200,
        });
    } catch (error) {
        console.error("[routing/run] error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
