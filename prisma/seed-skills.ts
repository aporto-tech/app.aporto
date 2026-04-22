/**
 * Seed script: 6 skills + providers
 *
 * Run after deploying the migration and setting OPENAI_API_KEY:
 *   npx ts-node --project tsconfig.json prisma/seed-skills.ts
 *   -- or --
 *   bun run prisma/seed-skills.ts
 *
 * Each skill gets an embedding generated from its name + description.
 * Providers point to the internal /api/providers/[service] wrapper routes.
 * Decision #30: providers are created with isActive=true (wrapper routes exist).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://app.aporto.tech";

async function embedText(text: string): Promise<number[]> {
    const baseUrl = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
    const apiKey = process.env.NEWAPI_ADMIN_KEY;
    if (!apiKey) throw new Error("NEWAPI_ADMIN_KEY not set");
    const res = await fetch(`${baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    if (!res.ok) throw new Error(`Embeddings error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.data[0].embedding;
}

const SKILLS = [
    {
        name: "Web Search",
        description: "Search the web and retrieve sourced answers with references. Standard search for quick results, deep search for comprehensive research.",
        paramsSchema: { query: "string", depth: "string (standard|deep, default: standard)", outputType: "string (sourcedAnswer|searchResults, default: sourcedAnswer)" },
        tags: ["search", "web", "research"],
        providers: [
            {
                name: "Linkup Standard",
                endpoint: `${BASE_URL}/api/providers/search`,
                pricePerCall: 0.006,
            },
        ],
    },
    {
        name: "AI Search",
        description: "AI-powered search and research synthesis. Search mode returns web hits; research mode returns a long-form synthesized answer from multiple sources.",
        paramsSchema: { query: "string", type: "string (search|research, default: search)" },
        tags: ["search", "ai", "research", "synthesis"],
        providers: [
            {
                name: "You.com",
                endpoint: `${BASE_URL}/api/providers/ai-search`,
                pricePerCall: 0.005,
            },
        ],
    },
    {
        name: "SMS Send",
        description: "Send an SMS or WhatsApp verification code to a phone number. Uses E.164 format for the phone number.",
        paramsSchema: { to: "string (E.164 phone number, e.g. +15551234567)", type: "string (sms|whatsapp, default: sms)" },
        tags: ["sms", "messaging", "verification", "whatsapp"],
        providers: [
            {
                name: "Prelude",
                endpoint: `${BASE_URL}/api/providers/sms`,
                pricePerCall: 0.015,
            },
        ],
    },
    {
        name: "Image Generation",
        description: "Generate images from text prompts using fal.ai. Multiple model tiers: flux-schnell (fast, cheap), flux-dev (balanced), flux-pro (highest quality).",
        paramsSchema: {
            prompt: "string",
            model: "string (flux-schnell|flux-dev|flux-pro, default: flux-schnell)",
            image_size: "string (square_hd|square|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9, default: square_hd)",
            num_images: "number (1-4, default: 1)",
        },
        tags: ["image", "generation", "ai", "creative"],
        providers: [
            {
                name: "fal.ai flux-schnell",
                endpoint: `${BASE_URL}/api/providers/image`,
                pricePerCall: 0.004,
            },
        ],
    },
    {
        name: "Text to Speech",
        description: "Convert text to natural-sounding speech using ElevenLabs. Returns audio in MP3 format. Multiple voice options available.",
        paramsSchema: {
            text: "string",
            voice_id: "string (ElevenLabs voice ID, default: Rachel)",
            model_id: "string (default: eleven_v3)",
            output_format: "string (default: mp3_44100_128)",
        },
        tags: ["tts", "audio", "voice", "speech"],
        providers: [
            {
                name: "ElevenLabs",
                endpoint: `${BASE_URL}/api/providers/tts`,
                pricePerCall: 0.0024, // ~10 chars average
            },
        ],
    },
    {
        name: "LLM Chat",
        description: "Chat completions via the Aporto LLM gateway. Access all major models: OpenAI GPT-4o, Anthropic Claude, Google Gemini, and more. Pay per token.",
        paramsSchema: {
            model: "string (e.g. openai/gpt-4o-mini, anthropic/claude-haiku-4-5-20251001)",
            messages: "array of {role: system|user|assistant, content: string}",
            max_tokens: "number (optional)",
            temperature: "number 0-2 (optional)",
        },
        tags: ["llm", "chat", "ai", "completions"],
        providers: [
            {
                name: "Aporto Gateway",
                endpoint: `${BASE_URL}/api/providers/chat`,
                pricePerCall: 0.001, // varies by model; minimum estimate
            },
        ],
    },
];

async function main() {
    console.log("Seeding skills...");

    for (const skillDef of SKILLS) {
        // Check if skill already exists
        const existing = await prisma.$queryRawUnsafe<{ id: number }[]>(
            `SELECT id FROM "Skill" WHERE name = $1 LIMIT 1`,
            skillDef.name
        );

        if (existing.length > 0) {
            console.log(`  Skip "${skillDef.name}" — already exists (id=${existing[0].id})`);
            continue;
        }

        console.log(`  Embedding "${skillDef.name}"...`);
        const embedding = await embedText(`${skillDef.name}: ${skillDef.description}`);
        const vectorLiteral = `[${embedding.join(",")}]`;

        const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
            `INSERT INTO "Skill" (name, description, embedding, "paramsSchema", tags, "isActive", "createdAt")
             VALUES ($1, $2, $3::vector, $4, $5, true, NOW())
             RETURNING id`,
            skillDef.name,
            skillDef.description,
            vectorLiteral,
            JSON.stringify(skillDef.paramsSchema),
            JSON.stringify(skillDef.tags),
        );

        const skillId = rows[0].id;
        console.log(`  Created skill "${skillDef.name}" id=${skillId}`);

        for (const provDef of skillDef.providers) {
            await prisma.provider.create({
                data: {
                    skillId,
                    name: provDef.name,
                    endpoint: provDef.endpoint,
                    pricePerCall: provDef.pricePerCall,
                    avgLatencyMs: 500,
                    retryRate: 0,
                    isActive: true,
                },
            });
            console.log(`    Provider "${provDef.name}" → ${provDef.endpoint}`);
        }
    }

    console.log("Done.");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
