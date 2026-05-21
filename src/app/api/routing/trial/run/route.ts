import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WAIT_SECONDS, runSkill } from "@/lib/skillRuns";
import {
    TRIAL_LIMIT_MESSAGE,
    completeAnonymousTrialRun,
    getTrialIpHash,
    reserveAnonymousTrialRun,
} from "@/lib/anonymousTrial";

export const dynamic = "force-dynamic";

const ANONYMOUS_NEWAPI_USER_ID = Number(process.env.APORTO_TRIAL_NEWAPI_USER_ID ?? 0);
const TRIAL_ALL_SKILLS = process.env.APORTO_TRIAL_ALL_SKILLS !== "false";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const {
        anonymousClientId,
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

    const reservation = await reserveAnonymousTrialRun({
        anonymousClientId: typeof anonymousClientId === "string" ? anonymousClientId : null,
        ipHash: getTrialIpHash(req),
        skillId: typeof skillId === "number" ? skillId : null,
    });
    if (!reservation.allowed) {
        return NextResponse.json({
            success: false,
            status: "failed",
            error: {
                code: "TRIAL_LIMIT_EXCEEDED",
                message: reservation.message,
                retryable: false,
            },
            message: reservation.message,
        }, { status: 429 });
    }

    try {
        const result = await runSkill({
            source: "rest",
            newApiUserId: ANONYMOUS_NEWAPI_USER_ID,
            authHeader: "",
            internalBaseUrl: req.nextUrl.origin,
            intent,
            params,
            skillId,
            providerHint,
            waitForResult: Boolean(waitForResult),
            maxWaitSeconds: Number(maxWaitSeconds) || DEFAULT_WAIT_SECONDS,
            sessionId: sessionId ?? `trial-${reservation.usageId}`,
            billingMode: "trial",
            trialOnly: !TRIAL_ALL_SKILLS,
        });

        await completeAnonymousTrialRun({
            usageId: reservation.usageId,
            status: result.status,
            skillId: result.skillId || skillId || null,
            runId: result.runId,
        });

        return NextResponse.json({
            success: result.status !== "failed",
            trial: true,
            trialMessage: result.status === "failed" ? TRIAL_LIMIT_MESSAGE : undefined,
            ...result,
        }, { status: result.status === "failed" ? 422 : 200 });
    } catch (error) {
        await completeAnonymousTrialRun({
            usageId: reservation.usageId,
            status: "error",
            skillId: typeof skillId === "number" ? skillId : null,
        }).catch(() => {});
        console.error("[routing/trial/run] error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
