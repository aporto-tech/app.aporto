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
import { randomUUID } from "crypto";
import { copyUrlToR2 } from "@/lib/r2";
import { canonicalKieModel, normalizeKieCreateTaskInput } from "@/lib/kieModelRules";

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

type StoredArtifact = {
    url: string;
    storage_key: string;
};

const MEDIA_URL_RE = /^https?:\/\/\S+\.(png|jpe?g|webp|gif|mp3|wav|m4a|aac|ogg|mp4|mov|webm)(?:[?#]\S*)?$/i;

function extensionForUrl(url: string): string {
    const match = url.match(/\.(png|jpe?g|webp|gif|mp3|wav|m4a|aac|ogg|mp4|mov|webm)(?:[?#]|$)/i);
    return (match?.[1] ?? "bin").toLowerCase().replace("jpeg", "jpg");
}

function contentTypeForExtension(ext: string): string {
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    if (ext === "mp3") return "audio/mpeg";
    if (ext === "wav") return "audio/wav";
    if (ext === "m4a") return "audio/mp4";
    if (ext === "aac") return "audio/aac";
    if (ext === "ogg") return "audio/ogg";
    if (ext === "mp4") return "video/mp4";
    if (ext === "mov") return "video/quicktime";
    if (ext === "webm") return "video/webm";
    return "application/octet-stream";
}

async function storeMediaUrls(value: unknown): Promise<{ value: unknown; artifacts: StoredArtifact[] }> {
    const datePrefix = new Date().toISOString().slice(0, 10);
    const cache = new Map<string, StoredArtifact>();

    async function visit(node: unknown): Promise<unknown> {
        if (typeof node === "string") {
            if (!MEDIA_URL_RE.test(node)) return node;

            const cached = cache.get(node);
            if (cached) return cached.url;

            const ext = extensionForUrl(node);
            const key = `kie/${datePrefix}/${randomUUID()}.${ext}`;
            const url = await copyUrlToR2(node, key, contentTypeForExtension(ext));
            cache.set(node, { url, storage_key: key });
            return url;
        }

        if (Array.isArray(node)) {
            return Promise.all(node.map((item) => visit(item)));
        }

        if (node && typeof node === "object") {
            const entries = await Promise.all(
                Object.entries(node as Record<string, unknown>).map(async ([key, item]) => [key, await visit(item)] as const),
            );
            return Object.fromEntries(entries);
        }

        return node;
    }

    const storedValue = await visit(value);
    return { value: storedValue, artifacts: Array.from(cache.values()) };
}

function cleanPath(path: string) {
    if (!path.startsWith("/")) return `/${path}`;
    return path;
}

function isKieClientErrorMessage(message: string): boolean {
    return /\b(required|missing|invalid|unsupported|not supported|verify your input|bad request)\b/i.test(message);
}

function statusForKiePayload(payload: { code?: number; msg?: string; message?: string }): number {
    const code = payload.code;
    const message = `${payload.msg ?? ""} ${payload.message ?? ""}`.trim();

    if (code === 401) return 401;
    if (code === 402) return 402;
    if (code === 404) return 404;
    if (code === 408) return 408;
    if (code === 422) return 422;
    if (typeof code === "number" && code >= 400 && code < 500) return code;

    // KIE sometimes reports request validation/model-selection errors with
    // a provider code of 500. Treat those as caller/provider-config errors so
    // the routing layer does not retry them as transient 5xx failures.
    if (message && isKieClientErrorMessage(message)) return 400;

    return 502;
}

async function parseKieResponse(res: Response, options: { storeArtifacts?: boolean } = {}) {
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
        const status = statusForKiePayload(payload);
        return NextResponse.json(
            { success: false, message: payload.msg ?? payload.message ?? "KIE request failed", detail: payload },
            { status },
        );
    }

    const responsePayload: Record<string, unknown> = { success: true, ...payload, raw: data };
    if (!options.storeArtifacts) {
        return NextResponse.json(responsePayload);
    }

    const { value, artifacts } = await storeMediaUrls(responsePayload);
    const storedPayload = value as Record<string, unknown>;
    if (artifacts.length > 0) {
        storedPayload.stored_artifacts = artifacts;
    }

    return NextResponse.json(storedPayload);
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.KIE_API_KEY ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
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
            return parseKieResponse(res, { storeArtifacts: true });
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
            const canonicalModel = canonicalKieModel(model);
            requestBody = {
                model: canonicalModel,
                ...(typeof callBackUrl === "string" ? { callBackUrl } : {}),
                input: normalizeKieCreateTaskInput(canonicalModel, input),
            };
        } else {
            requestBody = {
                ...(bodyDefaults ?? {}),
                ...params,
            };
            if (typeof requestBody.aspectRatio === "string" && typeof requestBody.aspect_ratio !== "string") {
                requestBody.aspect_ratio = requestBody.aspectRatio;
                delete requestBody.aspectRatio;
            }
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

        return parseKieResponse(res, { storeArtifacts: requestType === "suno.direct" || requestType === "direct" });
    } catch (error) {
        console.error("[providers/kie] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
