import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

type StirlingField = {
    type?: string;
    format?: string;
    items?: StirlingField;
};

type StirlingConfig = {
    apiBaseUrl?: string;
    path?: string;
    method?: string;
    contentType?: string;
    stirlingApiKey?: string;
    fixedParams?: Record<string, unknown>;
    fields?: Record<string, StirlingField>;
    responseExtension?: string;
};

const CONFIG_KEYS = new Set([
    "apiBaseUrl",
    "path",
    "method",
    "contentType",
    "stirlingApiKey",
    "fixedParams",
    "fields",
    "responseExtension",
    "timeoutMs",
    "responseCapBytes",
    "inputMappings",
]);

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripConfig(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(input).filter(([key]) => !CONFIG_KEYS.has(key)));
}

function isBinaryField(field?: StirlingField): boolean {
    if (!field) return false;
    if (field.format === "binary") return true;
    return field.type === "array" && field.items?.format === "binary";
}

function contentTypeForFilename(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "application/pdf";
    if (ext === "png") return "image/png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "html") return "text/html";
    if (ext === "md") return "text/markdown";
    if (ext === "txt") return "text/plain";
    if (ext === "csv") return "text/csv";
    if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    return "application/octet-stream";
}

function filenameFromUrl(url: string, fallback: string): string {
    try {
        const pathname = new URL(url).pathname;
        const name = pathname.split("/").filter(Boolean).pop();
        return name ? decodeURIComponent(name) : fallback;
    } catch {
        return fallback;
    }
}

async function filePartFromUrl(url: string, fieldName: string): Promise<File> {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Failed to fetch ${fieldName} fileUrl: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const filename = filenameFromUrl(url, `${fieldName}.bin`);
    return new File([buffer], filename, {
        type: res.headers.get("content-type") ?? contentTypeForFilename(filename),
    });
}

function filePartFromBase64(value: string, fieldName: string, filename?: unknown, contentType?: unknown): File {
    const buffer = Buffer.from(value.replace(/^data:[^;]+;base64,/, ""), "base64");
    const resolvedName = typeof filename === "string" && filename.trim() ? filename.trim() : `${fieldName}.bin`;
    return new File([buffer], resolvedName, {
        type: typeof contentType === "string" ? contentType : contentTypeForFilename(resolvedName),
    });
}

async function appendFile(form: FormData, fieldName: string, value: unknown, params: Record<string, unknown>) {
    if (value == null) return;

    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
        if (typeof item === "string" && /^https?:\/\//i.test(item)) {
            form.append(fieldName, await filePartFromUrl(item, fieldName));
            continue;
        }
        if (typeof item === "string") {
            form.append(
                fieldName,
                filePartFromBase64(item, fieldName, params[`${fieldName}Filename`], params[`${fieldName}ContentType`]),
            );
            continue;
        }
        if (isObject(item)) {
            const fileUrl = item.fileUrl ?? item.url;
            const fileBase64 = item.fileBase64 ?? item.base64;
            if (typeof fileUrl === "string") {
                form.append(fieldName, await filePartFromUrl(fileUrl, fieldName));
                continue;
            }
            if (typeof fileBase64 === "string") {
                form.append(fieldName, filePartFromBase64(fileBase64, fieldName, item.filename, item.contentType));
                continue;
            }
        }
    }
}

function appendScalar(form: FormData, key: string, value: unknown) {
    if (value == null) return;
    if (Array.isArray(value)) {
        for (const item of value) form.append(key, typeof item === "object" ? JSON.stringify(item) : String(item));
        return;
    }
    form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
}

function buildPath(path: string, params: Record<string, unknown>): string {
    return path.replace(/\{([^}]+)\}/g, (_, key: string) => {
        const value = params[key];
        if (value == null) throw new Error(`Missing required path parameter: ${key}`);
        return encodeURIComponent(String(value));
    });
}

function extensionForResponse(contentType: string, fallback?: string): string {
    if (fallback) return fallback.replace(/^\./, "");
    if (contentType.includes("pdf")) return "pdf";
    if (contentType.includes("zip")) return "zip";
    if (contentType.includes("png")) return "png";
    if (contentType.includes("jpeg")) return "jpg";
    if (contentType.includes("webp")) return "webp";
    if (contentType.includes("gif")) return "gif";
    if (contentType.includes("csv")) return "csv";
    if (contentType.includes("markdown")) return "md";
    if (contentType.includes("text")) return "txt";
    if (contentType.includes("json")) return "json";
    return "bin";
}

function filenameFromDisposition(disposition: string | null, extension: string): string {
    const match = disposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1].replace(/"$/, ""));
    return `stirling-result-${randomUUID()}.${extension}`;
}

export async function POST(req: NextRequest) {
    try {
        const publisherApiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
        const body = await req.json() as Record<string, unknown> & StirlingConfig;
        const config = body as StirlingConfig;

        if (!publisherApiKey) {
            return NextResponse.json({ success: false, message: "Missing Publisher API key" }, { status: 503 });
        }
        if (!config.stirlingApiKey || typeof config.stirlingApiKey !== "string") {
            return NextResponse.json({ success: false, message: "Missing Stirling API key in provider syncConfig" }, { status: 503 });
        }
        if (!config.path || typeof config.path !== "string") {
            return NextResponse.json({ success: false, message: "Missing Stirling path in provider syncConfig" }, { status: 400 });
        }

        const params = {
            ...stripConfig(body),
            ...(isObject(config.fixedParams) ? config.fixedParams : {}),
        };
        const apiBaseUrl = config.apiBaseUrl ?? "https://yieldcars.com/publisher/stirling";
        const url = new URL(buildPath(config.path, params), apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`);
        const fields = isObject(config.fields) ? config.fields : {};
        const method = config.method?.toUpperCase() ?? "POST";
        const headers: Record<string, string> = {
            "X-Publisher-API-Key": publisherApiKey,
            "X-API-KEY": config.stirlingApiKey,
        };

        let fetchBody: BodyInit | undefined;
        if (config.contentType === "application/json") {
            headers["Content-Type"] = "application/json";
            fetchBody = JSON.stringify(params);
        } else {
            const form = new FormData();
            for (const [key, value] of Object.entries(params)) {
                if (key.endsWith("Filename") || key.endsWith("ContentType")) continue;
                if (isBinaryField(fields[key])) await appendFile(form, key, value, params);
                else appendScalar(form, key, value);
            }
            fetchBody = form;
        }

        const res = await fetch(url, {
            method,
            headers,
            body: method === "GET" ? undefined : fetchBody,
            signal: AbortSignal.timeout(240_000),
        });

        const contentType = res.headers.get("content-type") ?? "application/octet-stream";
        if (contentType.includes("application/json")) {
            const data = await res.json();
            return NextResponse.json(
                { success: res.ok, ...data },
                { status: res.ok ? 200 : res.status },
            );
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        if (!res.ok) {
            return NextResponse.json(
                { success: false, message: buffer.toString("utf8").slice(0, 1000) || `Stirling error ${res.status}` },
                { status: res.status },
            );
        }

        const extension = extensionForResponse(contentType, config.responseExtension);
        const filename = filenameFromDisposition(res.headers.get("content-disposition"), extension);
        const key = `stirling/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${filename}`;
        const urlOut = await uploadToR2(key, buffer, contentType);

        return NextResponse.json({
            success: true,
            file: {
                url: urlOut,
                filename,
                contentType,
                size: buffer.length,
                storage_key: key,
            },
        });
    } catch (error) {
        console.error("[providers/stirling] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}

