/**
 * Aporto MCP Server — Streamable HTTP transport (stateless mode)
 *
 * Exposes Aporto partner services as MCP tools so AI coding assistants
 * (Claude Code, Cursor, Windsurf) can call them directly.
 *
 * Tools:
 *   aporto_search        — Web search via Linkup ($0.006 standard / $0.055 deep)
 *   aporto_ai_search     — AI-powered search via You.com ($0.005 / $0.0065 research)
 *   aporto_sms_send      — SMS/WhatsApp verification via Prelude ($0.015)
 *   aporto_image_generate — Image generation via fal.ai (from $0.004/MP)
 *   aporto_tts_create    — Text-to-speech via ElevenLabs ($0.24/1k chars)
 *   aporto_chat          — LLM chat completions via Aporto gateway
 *
 * Auth: Authorization: Bearer sk-live-{key}  (same key used for LLM calls)
 */

import { NextRequest, NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { validateApiKeyOrSession, deductUserQuota, logServiceUsage } from "@/lib/serviceProxy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── constants (mirror service routes) ────────────────────────────────────────

const LINKUP_BASE = "https://api.linkupapi.com/v1";
const YOUCOM_BASE = "https://api.ydc-index.io";
const PRELUDE_BASE = "https://api.prelude.dev/v2";
const FAL_BASE = "https://fal.run";
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

const MODEL_MAP: Record<string, { falModel: string; costPerMP: number }> = {
    "flux-schnell": { falModel: "fal-ai/flux/schnell", costPerMP: 0.004 },
    "flux-dev":     { falModel: "fal-ai/flux/dev",     costPerMP: 0.015 },
    "flux-pro":     { falModel: "fal-ai/flux-pro",      costPerMP: 0.04  },
};
const SIZE_TO_MP: Record<string, number> = {
    "square_hd":     1.05,
    "square":        0.25,
    "portrait_4_3":  0.75,
    "portrait_16_9": 0.58,
    "landscape_4_3": 0.75,
    "landscape_16_9":0.58,
};
const QUOTA_PER_DOLLAR = 500_000;

// ── helper: refund quota on provider error ────────────────────────────────────

async function refundQuota(userId: number, costUSD: number) {
    await prisma.$executeRawUnsafe(
        `UPDATE users SET quota = quota + $1, used_quota = used_quota - $1 WHERE id = $2`,
        Math.ceil(costUSD * QUOTA_PER_DOLLAR),
        userId
    );
}

// ── build the MCP server (one per request in stateless mode) ──────────────────

function buildMcpServer(userId: number, authHeader: string) {
    const server = new McpServer({
        name: "aporto",
        version: "1.0.0",
    });

    // ── aporto_search ─────────────────────────────────────────────────────────
    server.tool(
        "aporto_search",
        "Search the web using Linkup. Returns sourced answers with references. Standard depth ($0.006) is fast; deep ($0.055) retrieves more sources.",
        {
            query:      z.string().describe("Search query"),
            depth:      z.enum(["standard", "deep"]).optional().default("standard")
                         .describe("standard = $0.006, deep = $0.055"),
            outputType: z.enum(["sourcedAnswer", "searchResults"]).optional().default("sourcedAnswer")
                         .describe("sourcedAnswer returns a text answer with sources; searchResults returns raw results"),
        },
        async ({ query, depth = "standard", outputType = "sourcedAnswer" }) => {
            const costUSD = depth === "deep" ? 0.055 : 0.006;
            const balanceError = await deductUserQuota(userId, costUSD);
            if (balanceError) {
                return { content: [{ type: "text" as const, text: "Error: Insufficient balance. Top up at https://app.aporto.tech/dashboard/billing" }], isError: true };
            }

            const res = await fetch(`${LINKUP_BASE}/search`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${process.env.LINKUP_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ q: query, depth, outputType }),
            });
            const data = await res.json();

            if (!res.ok) {
                await refundQuota(userId, costUSD);
                return { content: [{ type: "text" as const, text: `Linkup error: ${data.message ?? res.status}` }], isError: true };
            }

            await logServiceUsage(userId, "search", "linkup", costUSD, { query, depth });
            return { content: [{ type: "text" as const, text: JSON.stringify({ ...data, costUSD }, null, 2) }] };
        }
    );

    // ── aporto_ai_search ──────────────────────────────────────────────────────
    server.tool(
        "aporto_ai_search",
        "AI-powered search via You.com. Search mode ($0.005) returns web hits; research mode ($0.0065) returns a synthesized long-form answer.",
        {
            query: z.string().describe("Search or research query"),
            type:  z.enum(["search", "research"]).optional().default("search")
                    .describe("search = $0.005 (web hits), research = $0.0065 (synthesized answer)"),
        },
        async ({ query, type = "search" }) => {
            const costUSD = type === "research" ? 0.0065 : 0.005;
            const balanceError = await deductUserQuota(userId, costUSD);
            if (balanceError) {
                return { content: [{ type: "text" as const, text: "Error: Insufficient balance. Top up at https://app.aporto.tech/dashboard/billing" }], isError: true };
            }

            const endpoint = type === "research" ? "/rag" : "/search";
            const url = new URL(`${YOUCOM_BASE}${endpoint}`);
            url.searchParams.set("query", query);

            const res = await fetch(url.toString(), {
                headers: { "X-API-Key": process.env.YOUCOM_API_KEY ?? "" },
            });
            const data = await res.json();

            if (!res.ok) {
                await refundQuota(userId, costUSD);
                return { content: [{ type: "text" as const, text: `You.com error: ${data.message ?? res.status}` }], isError: true };
            }

            await logServiceUsage(userId, "ai-search", "youcom", costUSD, { query, type });
            return { content: [{ type: "text" as const, text: JSON.stringify({ ...data, costUSD }, null, 2) }] };
        }
    );

    // ── aporto_sms_send ───────────────────────────────────────────────────────
    server.tool(
        "aporto_sms_send",
        "Send an SMS or WhatsApp verification code to a phone number via Prelude. Costs $0.015 per send.",
        {
            to:   z.string().describe("Phone number in E.164 format, e.g. +15551234567"),
            type: z.enum(["sms", "whatsapp"]).optional().default("sms")
                   .describe("Channel: sms (default) or whatsapp"),
        },
        async ({ to, type = "sms" }) => {
            const costUSD = 0.015;
            const balanceError = await deductUserQuota(userId, costUSD);
            if (balanceError) {
                return { content: [{ type: "text" as const, text: "Error: Insufficient balance. Top up at https://app.aporto.tech/dashboard/billing" }], isError: true };
            }

            const res = await fetch(`${PRELUDE_BASE}/verification`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${process.env.PRELUDE_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    target: { type: "phone_number", value: to },
                    ...(type === "whatsapp" ? { dispatch_id: "whatsapp" } : {}),
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                await refundQuota(userId, costUSD);
                return { content: [{ type: "text" as const, text: `Prelude error: ${data.message ?? res.status}` }], isError: true };
            }

            await logServiceUsage(userId, "sms", "prelude", costUSD, { to, type, status: "sent" });
            return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...data, costUSD }, null, 2) }] };
        }
    );

    // ── aporto_image_generate ─────────────────────────────────────────────────
    server.tool(
        "aporto_image_generate",
        "Generate images via fal.ai. flux-schnell is cheapest ($0.004/MP). Returns image URLs.",
        {
            prompt:     z.string().describe("Image description prompt"),
            model:      z.enum(["flux-schnell", "flux-dev", "flux-pro"]).optional().default("flux-schnell")
                         .describe("flux-schnell = $0.004/MP (fastest), flux-dev = $0.015/MP, flux-pro = $0.04/MP"),
            image_size: z.enum(["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"])
                         .optional().default("square_hd")
                         .describe("square_hd = 1024x1024 (default)"),
            num_images: z.number().int().min(1).max(4).optional().default(1)
                         .describe("Number of images to generate (1-4)"),
        },
        async ({ prompt, model = "flux-schnell", image_size = "square_hd", num_images = 1 }) => {
            const modelConfig = MODEL_MAP[model] ?? MODEL_MAP["flux-schnell"];
            const mp = SIZE_TO_MP[image_size] ?? 1.0;
            const costUSD = modelConfig.costPerMP * mp * Math.max(1, Math.min(4, num_images));

            const balanceError = await deductUserQuota(userId, costUSD);
            if (balanceError) {
                return { content: [{ type: "text" as const, text: "Error: Insufficient balance. Top up at https://app.aporto.tech/dashboard/billing" }], isError: true };
            }

            const res = await fetch(`${FAL_BASE}/${modelConfig.falModel}`, {
                method: "POST",
                headers: { "Authorization": `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, image_size, num_images: Math.max(1, Math.min(4, num_images)) }),
            });
            const data = await res.json();

            if (!res.ok) {
                await refundQuota(userId, costUSD);
                return { content: [{ type: "text" as const, text: `fal.ai error: ${data.message ?? res.status}` }], isError: true };
            }

            await logServiceUsage(userId, "image", "fal", costUSD, { model: modelConfig.falModel, image_size, num_images });

            // Return image URLs as both text and image content blocks
            const images: { url: string; width: number; height: number }[] = data.images ?? [];
            const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
                { type: "text", text: `Generated ${images.length} image(s). Cost: $${costUSD.toFixed(4)}` },
                ...images.map((img) => ({ type: "text" as const, text: `Image URL: ${img.url}` })),
            ];

            return { content };
        }
    );

    // ── aporto_tts_create ─────────────────────────────────────────────────────
    server.tool(
        "aporto_tts_create",
        "Convert text to speech via ElevenLabs. Returns base64-encoded audio/mpeg. Cost: $0.24 per 1,000 characters.",
        {
            text:          z.string().describe("Text to convert to speech"),
            voice_id:      z.string().optional().default("21m00Tcm4TlvDq8ikWAM")
                            .describe("ElevenLabs voice ID. Default: Rachel (21m00Tcm4TlvDq8ikWAM)"),
            model_id:      z.string().optional().default("eleven_v3")
                            .describe("ElevenLabs model. Default: eleven_v3"),
            output_format: z.string().optional().default("mp3_44100_128")
                            .describe("Audio format. Default: mp3_44100_128"),
        },
        async ({ text, voice_id = "21m00Tcm4TlvDq8ikWAM", model_id = "eleven_v3", output_format = "mp3_44100_128" }) => {
            const costUSD = Math.max(0.0001, (text.length / 1000) * 0.24);

            const balanceError = await deductUserQuota(userId, costUSD);
            if (balanceError) {
                return { content: [{ type: "text" as const, text: "Error: Insufficient balance. Top up at https://app.aporto.tech/dashboard/billing" }], isError: true };
            }

            const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voice_id}`, {
                method: "POST",
                headers: {
                    "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                body: JSON.stringify({
                    text,
                    model_id,
                    output_format,
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
                }),
            });

            if (!res.ok) {
                const errText = await res.text();
                await refundQuota(userId, costUSD);
                return { content: [{ type: "text" as const, text: `ElevenLabs error ${res.status}: ${errText}` }], isError: true };
            }

            await logServiceUsage(userId, "tts", "elevenlabs", costUSD, { charCount: text.length, voice_id, model_id });

            const audioBuffer = await res.arrayBuffer();
            const base64Audio = Buffer.from(audioBuffer).toString("base64");

            return {
                content: [
                    { type: "text" as const, text: `Audio generated. ${text.length} chars, cost $${costUSD.toFixed(4)}. Format: ${output_format}.` },
                    { type: "text" as const, text: `base64:audio/mpeg:${base64Audio}` },
                ],
            };
        }
    );

    // ── aporto_chat ───────────────────────────────────────────────────────────
    server.tool(
        "aporto_chat",
        "LLM chat completions via Aporto gateway. Supports all models available at api.aporto.tech (OpenAI, Anthropic, Gemini, etc).",
        {
            model:       z.string().describe("Model ID, e.g. openai/gpt-4o-mini, anthropic/claude-haiku-4-5-20251001"),
            messages:    z.array(z.object({
                             role:    z.enum(["system", "user", "assistant"]),
                             content: z.string(),
                         })).describe("Chat messages array"),
            max_tokens:  z.number().int().optional().describe("Max tokens to generate"),
            temperature: z.number().min(0).max(2).optional().describe("Sampling temperature 0-2"),
        },
        async ({ model, messages, max_tokens, temperature }) => {
            const newApiUrl = process.env.NEWAPI_URL ?? "https://api.aporto.tech";

            const body: Record<string, unknown> = { model, messages };
            if (max_tokens !== undefined) body.max_tokens = max_tokens;
            if (temperature !== undefined) body.temperature = temperature;

            const res = await fetch(`${newApiUrl}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Authorization": authHeader,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                return { content: [{ type: "text" as const, text: `LLM error ${res.status}: ${data.error?.message ?? JSON.stringify(data)}` }], isError: true };
            }

            const reply = data.choices?.[0]?.message?.content ?? JSON.stringify(data);
            return { content: [{ type: "text" as const, text: reply }] };
        }
    );

    return server;
}

// ── Next.js route handlers ────────────────────────────────────────────────────

async function handleMcpRequest(request: NextRequest): Promise<Response> {
    const auth = await validateApiKeyOrSession(request);
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authHeader = request.headers.get("authorization") ?? "";

    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — required for serverless
        enableJsonResponse: true,      // return JSON instead of SSE for simple tool calls
    });

    const server = buildMcpServer(auth.newApiUserId, authHeader);
    await server.connect(transport);

    return transport.handleRequest(request);
}

export async function POST(request: NextRequest) {
    return handleMcpRequest(request);
}

export async function GET(request: NextRequest) {
    return handleMcpRequest(request);
}

export async function DELETE(request: NextRequest) {
    return handleMcpRequest(request);
}
