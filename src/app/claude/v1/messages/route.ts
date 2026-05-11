/**
 * Claude Messages proxy for KIE Claude Sonnet 4.6.
 *
 * Public path: /claude/v1/messages
 * Upstream path: https://api.kie.ai/claude/v1/messages
 *
 * KIE is close to Anthropic's Messages API, but uses:
 * - Bearer auth instead of Anthropic x-api-key
 * - model alias "claude-sonnet-4-6"
 * - thinkingFlag boolean instead of Anthropic's thinking object
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const KIE_BASE = process.env.KIE_BASE ?? "https://api.kie.ai";
const KIE_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

type JsonObject = Record<string, unknown>;

type AnthropicMessage = {
    role?: unknown;
    content?: unknown;
};

function isObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractBearer(req: NextRequest): string {
    const auth = req.headers.get("authorization") ?? "";
    return auth.replace(/^Bearer\s+/i, "").trim();
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

function normalizeMessages(messages: unknown): { messages: AnthropicMessage[]; systemParts: string[] } {
    if (!Array.isArray(messages)) {
        throw new Error("messages must be an array");
    }

    const normalized: AnthropicMessage[] = [];
    const systemParts: string[] = [];

    for (const message of messages) {
        if (!isObject(message)) {
            throw new Error("each message must be an object");
        }

        const role = message.role;
        if (role === "system" || role === "developer") {
            const systemText = textFromContent(message.content);
            if (systemText) systemParts.push(systemText);
            continue;
        }

        if (role !== "user" && role !== "assistant") {
            throw new Error(`unsupported message role: ${String(role)}`);
        }

        normalized.push({
            role,
            content: message.content,
        });
    }

    return { messages: normalized, systemParts };
}

function normalizeThinking(body: JsonObject, target: JsonObject) {
    if (typeof body.thinkingFlag === "boolean") {
        target.thinkingFlag = body.thinkingFlag;
        return;
    }

    const thinking = body.thinking;
    if (isObject(thinking)) {
        target.thinkingFlag = thinking.type === "enabled";
        return;
    }

    if (typeof thinking === "boolean") {
        target.thinkingFlag = thinking;
    }
}

function normalizeRequest(body: unknown): JsonObject {
    if (!isObject(body)) {
        throw new Error("request body must be a JSON object");
    }

    const { messages, systemParts } = normalizeMessages(body.messages);
    if (messages.length === 0) {
        throw new Error("at least one user or assistant message is required");
    }

    const target: JsonObject = { ...body };
    target.model = KIE_CLAUDE_MODEL;
    target.messages = messages;

    delete target.thinking;
    normalizeThinking(body, target);

    if (systemParts.length > 0 && typeof target.system !== "string") {
        target.system = systemParts.join("\n\n");
    }

    if (typeof target.max_tokens !== "number") {
        target.max_tokens = 4096;
    }

    return target;
}

function proxyHeaders(req: NextRequest, apiKey: string): HeadersInit {
    const headers: HeadersInit = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };

    const anthropicVersion = req.headers.get("anthropic-version") ?? DEFAULT_ANTHROPIC_VERSION;
    headers["anthropic-version"] = anthropicVersion;

    const anthropicBeta = req.headers.get("anthropic-beta");
    if (anthropicBeta) headers["anthropic-beta"] = anthropicBeta;

    return headers;
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

export async function POST(req: NextRequest) {
    try {
        const apiKey = extractBearer(req);
        if (!apiKey) {
            return NextResponse.json(
                { type: "error", error: { type: "authentication_error", message: "Missing KIE bearer token" } },
                { status: 401 },
            );
        }

        const body = await req.json();
        const requestBody = normalizeRequest(body);

        const upstream = await fetch(`${KIE_BASE}/claude/v1/messages`, {
            method: "POST",
            headers: proxyHeaders(req, apiKey),
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(90_000),
        });

        if (requestBody.stream === true) {
            return new Response(upstream.body, {
                status: upstream.status,
                headers: {
                    "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
                    "Cache-Control": "no-cache, no-transform",
                },
            });
        }

        const data = await jsonOrText(upstream);
        return NextResponse.json(data, { status: upstream.status });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes("unsupported message role") || message.includes("messages") ? 400 : 500;
        console.error("[claude/v1/messages] POST error:", error);
        return NextResponse.json(
            { type: "error", error: { type: status === 400 ? "invalid_request_error" : "api_error", message } },
            { status },
        );
    }
}
