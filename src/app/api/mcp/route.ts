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
 *
 * Billing notes:
 *   - search / ai-search / sms / image / chat: billing handled by the service
 *     endpoint that the provider proxies to (deductUserQuota runs there).
 *   - tts: provider/tts calls ElevenLabs directly without billing, so the MCP
 *     tool must deduct quota upfront and refund on failure.
 */

import { NextRequest, NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { validateApiKeyOrSession, deductUserQuota } from "@/lib/serviceProxy";
import { prisma } from "@/lib/prisma";
import { discoverSkills, selectProvider, executeSkillViaProvider, updateProviderStats, recordSkillCall } from "@/lib/routing";

export const dynamic = "force-dynamic";

// ── Skill IDs (must match the Skill table) ────────────────────────────────────

const SKILL = {
    SEARCH:    1,
    AI_SEARCH: 2,
    SMS:       3,
    IMAGE:     4,
    TTS:       5,
    CHAT:      6,
} as const;

const QUOTA_PER_DOLLAR = 500_000;

async function refundQuota(userId: number, costUSD: number) {
    await prisma.$executeRawUnsafe(
        `UPDATE users SET quota = quota + $1, used_quota = used_quota - $1 WHERE id = $2`,
        Math.ceil(costUSD * QUOTA_PER_DOLLAR),
        userId,
    );
}

// ── build the MCP server (one per request in stateless mode) ──────────────────

function buildMcpServer(userId: number, authHeader: string) {
    const server = new McpServer({
        name: "aporto",
        version: "1.0.0",
    });

    /**
     * Route a call through the provider selection + execution layer.
     * Returns null if no provider is available.
     */
    async function callSkill(
        skillId: number,
        params: Record<string, unknown>,
        sessionId: string,
        costUSD?: number,
    ): Promise<{ success: boolean; data: unknown } | null> {
        const provider = await selectProvider(skillId, sessionId, userId);
        if (!provider) return null;

        const { success, data, latencyMs } = await executeSkillViaProvider(provider, params, authHeader);

        void recordSkillCall({
            sessionId, newApiUserId: userId, skillId, providerId: provider.id,
            latencyMs, success, costUSD,
        }).catch((e) => console.error("[callSkill] recordSkillCall:", e));

        void updateProviderStats(provider.id, latencyMs, success)
            .catch((e) => console.error("[callSkill] updateProviderStats:", e));

        return { success, data };
    }

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
            const sessionId = `mcp-${userId}-${Date.now()}`;
            const costUSD = depth === "deep" ? 0.055 : 0.006;

            const result = await callSkill(SKILL.SEARCH, { query, depth, outputType }, sessionId, costUSD);
            if (!result) return { content: [{ type: "text" as const, text: "No providers available" }], isError: true };
            if (!result.success) return { content: [{ type: "text" as const, text: `Error: ${JSON.stringify(result.data)}` }], isError: true };

            return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
        },
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
            const sessionId = `mcp-${userId}-${Date.now()}`;
            const costUSD = type === "research" ? 0.0065 : 0.005;

            const result = await callSkill(SKILL.AI_SEARCH, { query, type }, sessionId, costUSD);
            if (!result) return { content: [{ type: "text" as const, text: "No providers available" }], isError: true };
            if (!result.success) return { content: [{ type: "text" as const, text: `Error: ${JSON.stringify(result.data)}` }], isError: true };

            return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
        },
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
            const sessionId = `mcp-${userId}-${Date.now()}`;

            const result = await callSkill(SKILL.SMS, { to, type }, sessionId, 0.015);
            if (!result) return { content: [{ type: "text" as const, text: "No providers available" }], isError: true };
            if (!result.success) return { content: [{ type: "text" as const, text: `Error: ${JSON.stringify(result.data)}` }], isError: true };

            return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
        },
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
            const sessionId = `mcp-${userId}-${Date.now()}`;

            const result = await callSkill(SKILL.IMAGE, { prompt, model, image_size, num_images }, sessionId);
            if (!result) return { content: [{ type: "text" as const, text: "No providers available" }], isError: true };
            if (!result.success) return { content: [{ type: "text" as const, text: `Error: ${JSON.stringify(result.data)}` }], isError: true };

            const data = result.data as { images?: { url: string }[] };
            const images = data.images ?? [];
            return {
                content: [
                    { type: "text" as const, text: `Generated ${images.length} image(s).` },
                    ...images.map((img) => ({ type: "text" as const, text: `Image URL: ${img.url}` })),
                ],
            };
        },
    );

    // ── aporto_tts_create ─────────────────────────────────────────────────────
    // provider/tts calls ElevenLabs + R2 directly without billing, so we
    // deduct quota here and refund on failure.
    server.tool(
        "aporto_tts_create",
        "Convert text to speech via ElevenLabs. Returns audio URL (valid 24h). Cost: $0.24 per 1,000 characters. " +
        "Use aporto_list_options(skillId=5, optionType=\"voice\") to discover available voices before calling this. " +
        "Common voices: Rachel (21m00Tcm4TlvDq8ikWAM, female adult american), " +
        "Bella (EXAVITQu4vr4xnSDxMaL, female young american), " +
        "Charlotte (XB0fDUnXU5powFXDhCwa, female young british, multilingual), " +
        "Daniel (onwK4e9ZLuTAKqWW03F9, male middle-aged british), " +
        "Adam (pNInz6obpgDQGcFmaJgB, male middle-aged american).",
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

            const sessionId = `mcp-${userId}-${Date.now()}`;
            const result = await callSkill(SKILL.TTS, { text, voice_id, model_id, output_format }, sessionId, costUSD);

            if (!result) {
                await refundQuota(userId, costUSD);
                return { content: [{ type: "text" as const, text: "No providers available" }], isError: true };
            }
            if (!result.success) {
                await refundQuota(userId, costUSD);
                return { content: [{ type: "text" as const, text: `ElevenLabs error: ${JSON.stringify(result.data)}` }], isError: true };
            }

            const data = result.data as { url: string | null; audio_base64?: string; expires_at?: string };
            if (data.url) {
                return {
                    content: [
                        { type: "text" as const, text: `Audio generated. ${text.length} chars, cost $${costUSD.toFixed(4)}.` },
                        { type: "text" as const, text: JSON.stringify({ url: data.url, expires_at: data.expires_at }) },
                    ],
                };
            }
            // S3 not yet configured — return base64 fallback
            return {
                content: [
                    { type: "text" as const, text: `Audio generated. ${text.length} chars, cost $${costUSD.toFixed(4)}.` },
                    { type: "text" as const, text: `base64:audio/mpeg:${data.audio_base64}` },
                ],
            };
        },
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
            const sessionId = `mcp-${userId}-${Date.now()}`;
            const params: Record<string, unknown> = { model, messages };
            if (max_tokens !== undefined) params.max_tokens = max_tokens;
            if (temperature !== undefined) params.temperature = temperature;

            const result = await callSkill(SKILL.CHAT, params, sessionId);
            if (!result) return { content: [{ type: "text" as const, text: "No providers available" }], isError: true };
            if (!result.success) return { content: [{ type: "text" as const, text: `LLM error: ${JSON.stringify(result.data)}` }], isError: true };

            const data = result.data as { choices?: { message?: { content?: string } }[] };
            const reply = data.choices?.[0]?.message?.content ?? JSON.stringify(result.data);
            return { content: [{ type: "text" as const, text: reply }] };
        },
    );

    // ── aporto_list_options ───────────────────────────────────────────────────
    server.tool(
        "aporto_list_options",
        "List available options for a skill (voices, models, languages, etc.). " +
        "Call before aporto_execute_skill or aporto_tts_create to discover valid parameter values. " +
        "Example: aporto_list_options(skillId=5, optionType=\"voice\", query=\"young female russian\") returns Bella, Charlotte.",
        {
            skillId:    z.number().int().describe("Skill ID from aporto_discover_skills"),
            optionType: z.string().describe("Type of option: 'voice', 'model', 'language', 'style', etc."),
            query:      z.string().optional().describe("Natural language filter: 'young female', 'russian', 'british', 'fast', etc."),
            page:       z.number().int().min(0).optional().default(0).describe("Page index (0-based, 10 results per page)"),
        },
        async ({ skillId, optionType, query = null, page = 0 }) => {
            try {
                const PAGE_SIZE = 10;
                const q = query ? `%${query}%` : null;
                const options = await prisma.$queryRawUnsafe<{
                    optionKey: string; label: string; metadata: unknown;
                    providerId: number; lastSyncedAt: string;
                }[]>(
                    `SELECT "optionKey", label, metadata, "providerId", "lastSyncedAt"
                     FROM "ProviderOption"
                     WHERE "skillId" = $1 AND "optionType" = $2 AND "isActive" = true
                       AND ($3::text IS NULL OR label ILIKE $3 OR metadata::text ILIKE $3)
                     ORDER BY label ASC
                     LIMIT $4 OFFSET $5`,
                    skillId, optionType, q, PAGE_SIZE, page * PAGE_SIZE,
                );
                return { content: [{ type: "text" as const, text: JSON.stringify(options, null, 2) }] };
            } catch (err) {
                return { content: [{ type: "text" as const, text: `Options error: ${String(err)}` }], isError: true };
            }
        },
    );

    // ── aporto_discover_skills ────────────────────────────────────────────────
    server.tool(
        "aporto_discover_skills",
        "Discover Aporto skills by describing what you need in plain language. Returns up to 5 matching skills with their IDs, descriptions, and parameter schemas. Use page to paginate. Call before aporto_execute_skill.",
        {
            query:      z.string().describe("Natural language description of what you need, e.g. 'search the web', 'generate an image', 'send an SMS'"),
            sessionId:  z.string().optional().describe("Caller-controlled session identifier for retry routing, e.g. 'agent-abc123-20260421'. Recommended format: '{agent}-{uuid}-{date}'."),
            page:       z.number().int().min(0).optional().default(0).describe("Page index for pagination (0 = first 5 results, 1 = next 5, etc.)"),
            category:   z.string().optional().describe("Filter by category, e.g. 'media/image', 'search/web', 'llm/chat', 'communication/sms'"),
            capability: z.string().optional().describe("Filter by capability verb, e.g. 'generate', 'search', 'transcribe', 'translate', 'send'"),
        },
        async ({ query, page = 0, category, capability }) => {
            try {
                const skills = await discoverSkills(query, page, { category, capability });
                if (skills.length === 0) {
                    return {
                        content: [{ type: "text" as const, text: page > 0
                            ? "No more skills found. You have reached the end of the results."
                            : "No skills found matching your query. Try different keywords." }],
                    };
                }

                const result = skills.map((s) => ({
                        skillId: s.id,
                        name: s.name,
                        description: s.description,
                        category: s.category,
                        capabilities: s.capabilities,
                        inputTypes: s.inputTypes,
                        outputTypes: s.outputTypes,
                        paramsSchema: s.paramsSchema ? JSON.parse(s.paramsSchema) : null,
                        tags: s.tags ? JSON.parse(s.tags) : [],
                        similarity: Math.round(s.similarity * 100) / 100,
                    }));

                return {
                    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
                };
            } catch (err) {
                return {
                    content: [{ type: "text" as const, text: `Discovery error: ${String(err)}` }],
                    isError: true,
                };
            }
        },
    );

    // ── aporto_execute_skill ──────────────────────────────────────────────────
    server.tool(
        "aporto_execute_skill",
        "Execute an Aporto skill by its ID. The routing layer picks the best provider by price and latency. Passing the same sessionId on retry will automatically use a different provider. Get skillId from aporto_discover_skills.",
        {
            skillId:   z.number().int().describe("Skill ID from aporto_discover_skills"),
            params:    z.record(z.unknown()).describe("Parameters for the skill — see paramsSchema returned by aporto_discover_skills"),
            sessionId: z.string().optional().describe("Same sessionId used in aporto_discover_skills. Used to route retries to a different provider."),
        },
        async ({ skillId, params, sessionId = `mcp-${userId}-${Date.now()}` }) => {
            try {
                const result = await callSkill(skillId, params, sessionId, undefined);
                if (!result) {
                    return {
                        content: [{ type: "text" as const, text: "No active providers available for this skill." }],
                        isError: true,
                    };
                }

                if (!result.success) {
                    return {
                        content: [{ type: "text" as const, text: `Provider error: ${JSON.stringify(result.data)}` }],
                        isError: true,
                    };
                }

                return {
                    content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
                };
            } catch (err) {
                return {
                    content: [{ type: "text" as const, text: `Execution error: ${String(err)}` }],
                    isError: true,
                };
            }
        },
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
