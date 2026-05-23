#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply") || process.env.APPLY === "1";
const NEWAPI_URL = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;
const KIE_API_KEY = process.env.KIE_API_KEY;
const PROVIDER_ENDPOINT = process.env.KIE_LLM_PROVIDER_ENDPOINT ?? "https://app.aporto.tech/api/providers/kie-llm";
const EMBED_DELAY_MS = Number(process.env.EMBED_DELAY_MS ?? "250");
let fallbackEmbeddingLiteral;

const MODEL_CONTROLS = {
    type: "object",
    additionalProperties: true,
    properties: {
        prompt: { type: "string", description: "Single user prompt. Used when messages/input/contents are not provided." },
        messages: {
            type: "array",
            description: "OpenAI/Claude-compatible chat messages.",
            items: { type: "object", additionalProperties: true },
        },
        input: {
            description: "Responses API input array or plain prompt string.",
            anyOf: [{ type: "array", items: { type: "object", additionalProperties: true } }, { type: "string" }],
        },
        contents: {
            type: "array",
            description: "Native Gemini contents array.",
            items: { type: "object", additionalProperties: true },
        },
        system: { type: "string", description: "System instruction for Claude-style requests." },
        temperature: { type: "number", minimum: 0, maximum: 2 },
        top_p: { type: "number", minimum: 0, maximum: 1 },
        top_k: { type: "number" },
        max_tokens: { type: "integer", minimum: 1 },
        max_completion_tokens: { type: "integer", minimum: 1 },
        max_output_tokens: { type: "integer", minimum: 1 },
        stop: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
        stop_sequences: { type: "array", items: { type: "string" } },
        reasoning_effort: { type: "string", enum: ["low", "medium", "high", "xhigh"] },
        reasoning: { type: "object", additionalProperties: true, description: "Responses API reasoning object, e.g. { effort: 'high' }." },
        thinking: { anyOf: [{ type: "object", additionalProperties: true }, { type: "boolean" }] },
        thinkingFlag: { type: "boolean", description: "Claude thinking toggle used by KIE." },
        include_thoughts: { type: "boolean", description: "Gemini thought output toggle." },
        generationConfig: { type: "object", additionalProperties: true, description: "Native Gemini generationConfig, including thinkingConfig." },
        tools: { type: "array", items: { type: "object", additionalProperties: true } },
        tool_choice: { description: "Tool choice object/string for compatible endpoints." },
        response_format: { type: "object", additionalProperties: true, description: "Structured output JSON schema object." },
        seed: { type: "integer" },
        n: { type: "integer", minimum: 1 },
        presence_penalty: { type: "number" },
        frequency_penalty: { type: "number" },
        metadata: { type: "object", additionalProperties: true },
        stream: { type: "boolean", default: false, description: "Must be false for Aporto skill runs." },
    },
    oneOf: [
        { required: ["prompt"] },
        { required: ["messages"] },
        { required: ["input"] },
        { required: ["contents"] },
    ],
};

const SKILLS = [
    {
        name: "GPT 5.2 Chat",
        description: "Multimodal GPT 5.2 chat with image input, web search tools, and adjustable reasoning effort.",
        model: "gpt-5-2",
        mode: "chat-completions",
        apiPath: "/gpt-5-2/v1/chat/completions",
        tags: ["gpt", "chat", "reasoning", "multimodal", "web-search"],
    },
    {
        name: "GPT 5.4 Responses",
        description: "GPT 5.4 Responses API model for agentic reasoning, tool use, web search, image and file input.",
        model: "gpt-5-4",
        mode: "responses",
        apiPath: "/codex/v1/responses",
        tags: ["gpt", "responses", "reasoning", "agentic", "web-search"],
    },
    {
        name: "GPT 5.5 Responses",
        description: "GPT 5.5 Responses API model for advanced reasoning, coding, knowledge work, tool use, and multimodal input.",
        model: "gpt-5-5",
        mode: "responses",
        apiPath: "/codex/v1/responses",
        tags: ["gpt", "responses", "reasoning", "coding", "web-search"],
    },
    ...["gpt-5-codex", "gpt-5.1-codex", "gpt-5.2-codex", "gpt-5.3-codex", "gpt-5.4-codex"].map((model) => ({
        name: `${model.replace(/^gpt-/, "GPT ").replace(/-/g, " ")} Code`.replace(/\b\w/g, (c) => c.toUpperCase()).replace("Gpt", "GPT"),
        description: `${model} code-focused Responses API model with adjustable reasoning, tool use, web search, image and file input.`,
        model,
        mode: "responses",
        apiPath: "/api/v1/responses",
        tags: ["codex", "code", "responses", "reasoning", "web-search"],
    })),
    ...[
        ["Claude Opus 4.7 Chat", "claude-opus-4-7"],
        ["Claude Haiku 4.5 Chat", "claude-haiku-4-5"],
        ["Claude Opus 4.5 Chat", "claude-opus-4-5"],
        ["Claude Opus 4.6 Chat", "claude-opus-4-6"],
        ["Claude Sonnet 4.5 Chat", "claude-sonnet-4-5"],
        ["Claude Sonnet 4.6 Chat", "claude-sonnet-4-6"],
    ].map(([name, model]) => ({
        name,
        description: `${name} via Claude Messages API with tools, system prompts, streaming flag, and KIE thinkingFlag support.`,
        model,
        mode: "claude",
        apiPath: "/claude/v1/messages",
        tags: ["claude", "chat", "messages", "reasoning", "tools"],
    })),
    ...[
        ["Gemini 2.5 Pro Chat", "gemini-2.5-pro", "/gemini-2.5-pro/v1/chat/completions"],
        ["Gemini 3 Pro Chat", "gemini-3-pro", "/gemini-3-pro/v1/chat/completions"],
        ["Gemini 3.1 Pro Chat", "gemini-3.1-pro", "/gemini-3.1-pro/v1/chat/completions"],
        ["Gemini 2.5 Flash Chat", "gemini-2.5-flash", "/gemini-2.5-flash/v1/chat/completions"],
        ["Gemini 3 Flash Chat", "gemini-3-flash", "/gemini-3-flash/v1/chat/completions"],
    ].map(([name, model, apiPath]) => ({
        name,
        description: `${name} with OpenAI-compatible chat completions, multimodal input, Google Search/function tools, structured output, and reasoning controls.`,
        model,
        mode: "chat-completions",
        apiPath,
        tags: ["gemini", "chat", "multimodal", "reasoning", "structured-output"],
    })),
    {
        name: "Gemini 3 Flash Native Chat",
        description: "Native Gemini 3 Flash generateContent endpoint with contents, tools.googleSearch, functionDeclarations, and generationConfig.thinkingConfig.",
        model: "gemini-3-flash",
        mode: "gemini-native",
        apiPath: "/gemini/v1/models/gemini-3-flash-v1betamodels:streamGenerateContent",
        tags: ["gemini", "native", "chat", "reasoning", "google-search"],
    },
];

function buildEmbedText(skill) {
    return [
        "category:llm/chat",
        "capabilities:chat,reasoning,multimodal,tools,structured-output",
        "input:text,image,file,json",
        "output:text,json,tool-call",
        `${skill.name}: ${skill.description}`,
        `tags:${skill.tags.join(",")}`,
    ].join(" ");
}

async function embedText(text) {
    if (!NEWAPI_ADMIN_KEY) return null;
    const res = await fetch(`${NEWAPI_URL}/v1/embeddings`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${NEWAPI_ADMIN_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    if (!res.ok) throw new Error(`Embed error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    await new Promise((resolve) => setTimeout(resolve, EMBED_DELAY_MS));
    return data.data[0].embedding;
}

async function getFallbackEmbeddingLiteral() {
    if (fallbackEmbeddingLiteral !== undefined) return fallbackEmbeddingLiteral;
    const rows = await prisma.$queryRawUnsafe(
        `SELECT embedding::text AS embedding FROM "Skill" WHERE id = 6 AND embedding IS NOT NULL LIMIT 1`,
    );
    fallbackEmbeddingLiteral = rows[0]?.embedding ?? null;
    return fallbackEmbeddingLiteral;
}

async function upsertSkill(skill) {
    const existing = await prisma.$queryRawUnsafe(
        `SELECT id, (embedding IS NOT NULL) AS has_embedding FROM "Skill" WHERE name = $1 LIMIT 1`,
        skill.name,
    );
    let vectorLiteral = null;
    if (!existing[0]?.has_embedding) {
        try {
            const embedding = await embedText(buildEmbedText(skill));
            vectorLiteral = embedding ? `[${embedding.join(",")}]` : null;
        } catch (error) {
            console.warn(`  embedding failed for "${skill.name}", using LLM Chat fallback: ${error instanceof Error ? error.message : String(error)}`);
            vectorLiteral = await getFallbackEmbeddingLiteral();
        }
        if (!vectorLiteral) vectorLiteral = await getFallbackEmbeddingLiteral();
    }

    const commonArgs = [
        skill.description,
        "llm/chat",
        JSON.stringify(["chat", "reasoning", "multimodal", "tools", "structured-output"]),
        JSON.stringify(["text", "image", "file", "json"]),
        JSON.stringify(["text", "json", "tool-call"]),
        JSON.stringify(["kie", ...skill.tags, skill.model]),
        JSON.stringify(MODEL_CONTROLS),
    ];

    if (existing.length) {
        const id = existing[0].id;
        if (vectorLiteral) {
            await prisma.$executeRawUnsafe(
                `UPDATE "Skill"
                 SET description = $2, category = $3, capabilities = $4, "inputTypes" = $5,
                     "outputTypes" = $6, tags = $7, "paramsSchema" = $8, embedding = $9::vector,
                     status = 'live', "isActive" = true, "trialAvailable" = true
                 WHERE id = $1`,
                id,
                ...commonArgs,
                vectorLiteral,
            );
        } else {
            await prisma.$executeRawUnsafe(
                `UPDATE "Skill"
                 SET description = $2, category = $3, capabilities = $4, "inputTypes" = $5,
                     "outputTypes" = $6, tags = $7, "paramsSchema" = $8,
                     status = 'live', "isActive" = true, "trialAvailable" = true
                 WHERE id = $1`,
                id,
                ...commonArgs,
            );
        }
        return id;
    }

    const rows = vectorLiteral
        ? await prisma.$queryRawUnsafe(
            `INSERT INTO "Skill" (name, description, category, capabilities, "inputTypes", "outputTypes",
                                  tags, "paramsSchema", embedding, status, "isActive", "trialAvailable", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, 'live', true, true, NOW())
             RETURNING id`,
            skill.name,
            ...commonArgs,
            vectorLiteral,
        )
        : await prisma.$queryRawUnsafe(
            `INSERT INTO "Skill" (name, description, category, capabilities, "inputTypes", "outputTypes",
                                  tags, "paramsSchema", status, "isActive", "trialAvailable", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'live', true, true, NOW())
             RETURNING id`,
            skill.name,
            ...commonArgs,
        );
    return rows[0].id;
}

async function upsertProvider(skillId, skill) {
    const providerName = `KIE - ${skill.model}`;
    const syncConfig = JSON.stringify({
        mode: skill.mode,
        model: skill.model,
        apiPath: skill.apiPath,
        timeoutMs: 600000,
        docs: "https://docs.kie.ai/market/quickstart",
    });
    const existing = await prisma.$queryRawUnsafe(
        `SELECT id FROM "Provider" WHERE "skillId" = $1 AND name = $2 LIMIT 1`,
        skillId,
        providerName,
    );
    if (existing.length) {
        await prisma.$executeRawUnsafe(
            `UPDATE "Provider"
             SET endpoint = $2, "pricePerCall" = $3, "providerSecret" = $4,
                 "syncConfig" = $5, "isActive" = true
             WHERE id = $1`,
            existing[0].id,
            PROVIDER_ENDPOINT,
            0.0001,
            KIE_API_KEY,
            syncConfig,
        );
        return existing[0].id;
    }
    const rows = await prisma.$queryRawUnsafe(
        `INSERT INTO "Provider" (name, "skillId", endpoint, "isActive", "pricePerCall", "providerSecret", "syncConfig", "createdAt")
         VALUES ($1, $2, $3, true, $4, $5, $6, NOW())
         RETURNING id`,
        providerName,
        skillId,
        PROVIDER_ENDPOINT,
        0.0001,
        KIE_API_KEY,
        syncConfig,
    );
    return rows[0].id;
}

async function main() {
    if (!KIE_API_KEY && APPLY) throw new Error("KIE_API_KEY is required to apply providers");
    console.log(`KIE LLM skills to ${APPLY ? "upsert" : "preview"}: ${SKILLS.length}`);
    for (const skill of SKILLS) {
        console.log(`- ${skill.name} -> ${skill.apiPath} (${skill.model})`);
        if (!APPLY) continue;
        const skillId = await upsertSkill(skill);
        await upsertProvider(skillId, skill);
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
