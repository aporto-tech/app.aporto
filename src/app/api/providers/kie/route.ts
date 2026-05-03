/**
 * Provider: KIE media model runner.
 * Called by routing/execute with Authorization: Bearer {KIE_API_KEY}.
 *
 * The routing layer merges provider.syncConfig into params before calling this endpoint.
 * syncConfig supports:
 *   requestType    "jobs.createTask" | "jobs.recordInfo" | "suno.direct" | "direct"
 *   apiPath        KIE API path, e.g. /api/v1/jobs/createTask
 *   method         "POST" | "GET"
 *   model          KIE model id for jobs.createTask
 *   inputDefaults  object merged before caller params for jobs.createTask input
 *   bodyDefaults   object merged before caller params for suno.direct body
 *
 * Generation endpoints are asynchronous and return a taskId. Use the KIE media
 * task status skill to retrieve final URLs.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const KIE_BASE = "https://api.kie.ai";

type RequestType = "jobs.createTask" | "jobs.recordInfo" | "suno.direct" | "direct";

interface KieConfig {
    requestType?: RequestType;
    apiPath?: string;
    method?: "POST" | "GET";
    model?: string;
    inputDefaults?: Record<string, unknown>;
    bodyDefaults?: Record<string, unknown>;
}

function cleanPath(path: string) {
    if (!path.startsWith("/")) return `/${path}`;
    return path;
}

async function parseKieResponse(res: Response) {
    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }

    if (!res.ok) {
        return NextResponse.json(
            { success: false, message: `KIE error ${res.status}`, detail: data },
            { status: res.status },
        );
    }

    const payload = data as { code?: number; msg?: string; message?: string; data?: unknown };
    if (typeof payload.code === "number" && payload.code !== 200) {
        const status = payload.code === 402 ? 402 : payload.code === 401 ? 401 : 502;
        return NextResponse.json(
            { success: false, message: payload.msg ?? payload.message ?? "KIE request failed", detail: payload },
            { status },
        );
    }

    return NextResponse.json({ success: true, ...payload, raw: data });
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
        if (!apiKey) {
            return NextResponse.json({ success: false, message: "KIE API key not configured" }, { status: 503 });
        }

        const body = await req.json() as Record<string, unknown> & KieConfig;
        const {
            requestType = "jobs.createTask",
            apiPath,
            method = "POST",
            model,
            inputDefaults,
            bodyDefaults,
            ...params
        } = body;

        if (requestType === "jobs.recordInfo") {
            const taskId = params.taskId;
            if (!taskId || typeof taskId !== "string") {
                return NextResponse.json({ success: false, message: "taskId is required" }, { status: 400 });
            }
            const url = new URL(`${KIE_BASE}${cleanPath(apiPath ?? "/api/v1/jobs/recordInfo")}`);
            url.searchParams.set("taskId", taskId);
            const res = await fetch(url, {
                headers: { "Authorization": `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(30_000),
            });
            return parseKieResponse(res);
        }

        const path = cleanPath(apiPath ?? (requestType === "suno.direct" ? "/api/v1/generate" : "/api/v1/jobs/createTask"));
        let requestBody: Record<string, unknown>;

        if (requestType === "jobs.createTask") {
            if (!model) {
                return NextResponse.json({ success: false, message: "model is required in provider syncConfig" }, { status: 400 });
            }
            const callBackUrl = params.callBackUrl;
            const input = {
                ...(inputDefaults ?? {}),
                ...params,
            };
            delete (input as Record<string, unknown>).callBackUrl;
            requestBody = {
                model,
                ...(typeof callBackUrl === "string" ? { callBackUrl } : {}),
                input,
            };
        } else {
            requestBody = {
                ...(bodyDefaults ?? {}),
                ...params,
            };
        }

        const res = await fetch(`${KIE_BASE}${path}`, {
            method,
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(30_000),
        });

        return parseKieResponse(res);
    } catch (error) {
        console.error("[providers/kie] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
