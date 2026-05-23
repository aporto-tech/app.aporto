import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const KIE_BASE = process.env.KIE_BASE ?? "https://api.kie.ai";
const DEFAULT_TIMEOUT_MS = 600_000;

type JsonObject = Record<string, unknown>;
type KieLlmMode = "claude" | "chat-completions" | "responses" | "gemini-native";

const COMMON_KEYS = [
    "temperature",
    "top_p",
    "top_k",
    "stop",
    "stop_sequences",
    "max_tokens",
    "max_completion_tokens",
    "tools",
    "tool_choice",
    "response_format",
    "reasoning_effort",
    "reasoning",
    "thinking",
    "thinkingFlag",
    "include_thoughts",
    "generationConfig",
    "metadata",
    "seed",
    "n",
    "presence_penalty",
    "frequency_penalty",
    "stream",
] as const;

function isObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textFromContent(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === "string") return part;
                if (isObject(part) && typeof part.text === "string") return part.text;
                return "";
            })
            .filter(Boolean)
            .join("\n");
    }
    return "";
}

function messagesFromBody(body: JsonObject): JsonObject[] {
    if (Array.isArray(body.messages)) return body.messages.filter(isObject);
    if (typeof body.prompt === "string" && body.prompt.trim()) {
        return [{ role: "user", content: body.prompt.trim() }];
    }
    if (typeof body.input === "string" && body.input.trim()) {
        return [{ role: "user", content: body.input.trim() }];
    }
    return [];
}

function copyKnownKeys(source: JsonObject, target: JsonObject, keys: readonly string[] = COMMON_KEYS) {
    for (const key of keys) {
        if (source[key] !== undefined) target[key] = source[key];
    }
}

function normalizeClaude(body: JsonObject, model: string): JsonObject {
    const messages: JsonObject[] = [];
    const systemParts: string[] = [];

    for (const message of messagesFromBody(body)) {
        const role = message.role;
        if (role === "system" || role === "developer") {
            const text = textFromContent(message.content);
            if (text) systemParts.push(text);
            continue;
        }
        if (role === "user" || role === "assistant") {
            messages.push({ role, content: message.content });
        }
    }
    if (messages.length === 0) throw new Error("messages or prompt is required");

    const target: JsonObject = {
        model,
        messages,
        stream: false,
        max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 4096,
    };
    copyKnownKeys(body, target, ["temperature", "top_p", "top_k", "stop_sequences", "tools", "tool_choice", "thinkingFlag", "stream"]);
    if (typeof body.system === "string") target.system = body.system;
    else if (systemParts.length > 0) target.system = systemParts.join("\n\n");

    if (isObject(body.thinking)) target.thinkingFlag = body.thinking.type === "enabled";
    if (typeof body.thinking === "boolean") target.thinkingFlag = body.thinking;
    if (typeof body.reasoning === "boolean") target.thinkingFlag = body.reasoning;

    return target;
}

function normalizeChatCompletions(body: JsonObject, model: string): JsonObject {
    const messages = messagesFromBody(body);
    if (messages.length === 0) throw new Error("messages or prompt is required");

    const target: JsonObject = { model, messages, stream: false };
    copyKnownKeys(body, target, [
        "temperature",
        "top_p",
        "max_tokens",
        "max_completion_tokens",
        "tools",
        "tool_choice",
        "response_format",
        "reasoning_effort",
        "include_thoughts",
        "metadata",
        "seed",
        "n",
        "presence_penalty",
        "frequency_penalty",
        "stop",
        "stream",
    ]);
    return target;
}

function contentPartFromMessageContent(content: unknown): unknown[] {
    if (typeof content === "string") return [{ type: "input_text", text: content }];
    if (!Array.isArray(content)) return [{ type: "input_text", text: String(content ?? "") }];
    return content.map((part) => {
        if (isObject(part) && part.type === "text" && typeof part.text === "string") {
            return { type: "input_text", text: part.text };
        }
        if (isObject(part) && part.type === "image_url" && isObject(part.image_url) && typeof part.image_url.url === "string") {
            return { type: "input_image", image_url: part.image_url.url };
        }
        return part;
    });
}

function normalizeResponses(body: JsonObject, model: string): JsonObject {
    const target: JsonObject = { model, stream: false };
    if (Array.isArray(body.input)) {
        target.input = body.input;
    } else {
        const messages = messagesFromBody(body);
        if (messages.length === 0) throw new Error("input, messages, or prompt is required");
        target.input = messages.map((message) => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: contentPartFromMessageContent(message.content),
        }));
    }

    copyKnownKeys(body, target, ["tools", "tool_choice", "reasoning", "metadata", "temperature", "top_p", "max_output_tokens", "stream"]);
    if (!target.reasoning && typeof body.reasoning_effort === "string") {
        target.reasoning = { effort: body.reasoning_effort };
    }
    return target;
}

function normalizeGeminiNative(body: JsonObject): JsonObject {
    const target: JsonObject = { stream: false };
    if (Array.isArray(body.contents)) {
        target.contents = body.contents;
    } else {
        const messages = messagesFromBody(body);
        if (messages.length === 0) throw new Error("contents, messages, or prompt is required");
        target.contents = messages
            .filter((message) => message.role !== "system" && message.role !== "developer")
            .map((message) => ({
                role: message.role === "assistant" ? "model" : "user",
                parts: [{ text: textFromContent(message.content) }],
            }));
    }

    copyKnownKeys(body, target, ["tools", "generationConfig", "stream"]);
    if (!target.generationConfig && (body.reasoning_effort || body.include_thoughts !== undefined)) {
        target.generationConfig = {
            thinkingConfig: {
                ...(body.include_thoughts !== undefined ? { includeThoughts: Boolean(body.include_thoughts) } : {}),
                ...(typeof body.reasoning_effort === "string" ? { thinkingLevel: body.reasoning_effort } : {}),
            },
        };
    }
    return target;
}

function normalizeBody(body: JsonObject): { apiPath: string; requestBody: JsonObject; timeoutMs: number } {
    const mode = String(body.mode ?? "chat-completions") as KieLlmMode;
    const apiPath = typeof body.apiPath === "string" ? body.apiPath : "";
    const model = typeof body.model === "string" ? body.model : "";
    if (!apiPath) throw new Error("apiPath is required in provider syncConfig");
    if (mode !== "gemini-native" && !model) throw new Error("model is required in provider syncConfig");

    const timeoutMs = Number.isFinite(Number(body.timeoutMs)) ? Number(body.timeoutMs) : DEFAULT_TIMEOUT_MS;
    const requestBody = mode === "claude"
        ? normalizeClaude(body, model)
        : mode === "responses"
            ? normalizeResponses(body, model)
            : mode === "gemini-native"
                ? normalizeGeminiNative(body)
                : normalizeChatCompletions(body, model);

    if (requestBody.stream === true) {
        throw new Error("stream=true is not supported through Aporto skill runs yet; use stream=false");
    }
    return { apiPath, requestBody, timeoutMs };
}

async function jsonOrText(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function extractText(data: unknown): string | null {
    if (!isObject(data)) return typeof data === "string" ? data : null;
    const choices = data.choices;
    if (Array.isArray(choices) && isObject(choices[0])) {
        const message = choices[0].message;
        if (isObject(message) && typeof message.content === "string") return message.content;
    }
    if (Array.isArray(data.content)) {
        return data.content
            .map((part) => isObject(part) && typeof part.text === "string" ? part.text : "")
            .filter(Boolean)
            .join("\n") || null;
    }
    if (Array.isArray(data.output)) {
        const parts: string[] = [];
        for (const item of data.output) {
            if (!isObject(item) || !Array.isArray(item.content)) continue;
            for (const part of item.content) {
                if (isObject(part) && typeof part.text === "string") parts.push(part.text);
            }
        }
        return parts.join("\n") || null;
    }
    if (Array.isArray(data.candidates) && isObject(data.candidates[0])) {
        const content = data.candidates[0].content;
        if (isObject(content) && Array.isArray(content.parts)) {
            return content.parts
                .map((part) => isObject(part) && typeof part.text === "string" ? part.text : "")
                .filter(Boolean)
                .join("\n") || null;
        }
    }
    return null;
}

function findNumberKey(value: unknown, keys: string[]): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (!value || typeof value !== "object") return null;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findNumberKey(item, keys);
            if (found != null) return found;
        }
        return null;
    }
    const object = value as JsonObject;
    for (const key of keys) {
        const direct = object[key];
        if (typeof direct === "number" && Number.isFinite(direct)) return direct;
        if (typeof direct === "string" && direct.trim() && Number.isFinite(Number(direct))) return Number(direct);
    }
    for (const child of Object.values(object)) {
        const found = findNumberKey(child, keys);
        if (found != null) return found;
    }
    return null;
}

function findUsage(data: unknown): unknown {
    if (!data || typeof data !== "object") return null;
    if (Array.isArray(data)) {
        for (const item of data) {
            const found = findUsage(item);
            if (found) return found;
        }
        return null;
    }
    const object = data as JsonObject;
    if (isObject(object.usage)) return object.usage;
    for (const child of Object.values(object)) {
        const found = findUsage(child);
        if (found) return found;
    }
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!apiKey) {
            return NextResponse.json({ success: false, message: "Missing KIE bearer token" }, { status: 401 });
        }

        const body = await req.json();
        if (!isObject(body)) {
            return NextResponse.json({ success: false, message: "request body must be a JSON object" }, { status: 400 });
        }

        const { apiPath, requestBody, timeoutMs } = normalizeBody(body);
        const upstream = await fetch(`${KIE_BASE}${apiPath}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(Math.max(1_000, Math.min(timeoutMs, DEFAULT_TIMEOUT_MS))),
        });

        const data = await jsonOrText(upstream);
        if (!upstream.ok) {
            return NextResponse.json(
                { success: false, message: `KIE LLM error ${upstream.status}`, detail: data },
                { status: upstream.status },
            );
        }

        return NextResponse.json({
            success: true,
            provider: "kie",
            model: requestBody.model ?? body.model ?? null,
            content: extractText(data),
            usage: findUsage(data),
            credits_consumed: findNumberKey(data, ["credits_consumed", "creditsConsumed", "credit_consumed", "creditConsumed"]),
            raw: data,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes("required") || message.includes("stream=true") ? 400 : 500;
        console.error("[providers/kie-llm] POST error:", error);
        return NextResponse.json({ success: false, message }, { status });
    }
}
