/**
 * Seed script: top-20 ElevenLabs voices into ProviderOption
 *
 * Run:
 *   bun run prisma/seed-options.ts
 *   -- or --
 *   npx ts-node --project tsconfig.json prisma/seed-options.ts
 *
 * Idempotent: uses upsert. Safe to re-run after the V1 cron syncs real data
 * (cron will replace these with live data on first run).
 *
 * Provider: ElevenLabs TTS (providerId=5, skillId=5)
 * Also sets syncEndpoint + syncConfig on the Provider row for V1 cron.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

const PROVIDER_ID = 5; // ElevenLabs TTS
const SKILL_ID    = 5; // TTS skill
const OPTION_TYPE = "voice";

const VOICES = [
    {
        optionKey: "21m00Tcm4TlvDq8ikWAM",
        label: "Rachel",
        metadata: { gender: "female", age: "adult", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/df6788f9-5c96-470d-8312-aab3b3d8f50a.mp3" },
    },
    {
        optionKey: "EXAVITQu4vr4xnSDxMaL",
        label: "Bella",
        metadata: { gender: "female", age: "young", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/eabc80e9-e37e-4a9e-8f63-c44f3ac68e1c.mp3" },
    },
    {
        optionKey: "XB0fDUnXU5powFXDhCwa",
        label: "Charlotte",
        metadata: { gender: "female", age: "young", accent: "british", languages: ["en", "de", "fr", "sv", "pt", "hi", "ja", "ko", "nl", "pl", "es", "tr", "zh"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XB0fDUnXU5powFXDhCwa/942356dc-f10d-4d89-bda5-4f8505ee038b.mp3" },
    },
    {
        optionKey: "pNInz6obpgDQGcFmaJgB",
        label: "Adam",
        metadata: { gender: "male", age: "middle-aged", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/e0b45450-78db-49b9-aaa4-d5358a6871bd.mp3" },
    },
    {
        optionKey: "ErXwobaYiN019PkySvjV",
        label: "Antoni",
        metadata: { gender: "male", age: "young", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/38d8f8f0-1122-4333-b323-0b87478d506a.mp3" },
    },
    {
        optionKey: "VR6AewLTigWG4xSOukaG",
        label: "Arnold",
        metadata: { gender: "male", age: "middle-aged", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/VR6AewLTigWG4xSOukaG/66e83dc2-6543-4897-9283-e5533e10fc40.mp3" },
    },
    {
        optionKey: "N2lVS1w4EtoT3dr4eOWO",
        label: "Callum",
        metadata: { gender: "male", age: "middle-aged", accent: "american", languages: ["en", "de", "fr", "sv", "pt", "hi", "ja", "ko", "nl", "pl", "es", "tr", "zh"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/N2lVS1w4EtoT3dr4eOWO/ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3" },
    },
    {
        optionKey: "IKne3meq5aSn9XLyUdCD",
        label: "Charlie",
        metadata: { gender: "male", age: "middle-aged", accent: "australian", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/IKne3meq5aSn9XLyUdCD/8f091240-558a-4d8b-abd8-284b25fe39de.mp3" },
    },
    {
        optionKey: "onwK4e9ZLuTAKqWW03F9",
        label: "Daniel",
        metadata: { gender: "male", age: "middle-aged", accent: "british", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/16d47b0e-35d9-4563-beab-1c9895d01e48.mp3" },
    },
    {
        optionKey: "g5CIjZEefAph4nQFvHAz",
        label: "Ethan",
        metadata: { gender: "male", age: "young", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/g5CIjZEefAph4nQFvHAz/26acfa14-38ce-4b5c-b7a3-6d6c5cdea93c.mp3" },
    },
    {
        optionKey: "jsCqWAovK2LkecY7zXl4",
        label: "Freya",
        metadata: { gender: "female", age: "young", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/jsCqWAovK2LkecY7zXl4/8e1f5240-556e-4fd5-892c-25df9ea3b593.mp3" },
    },
    {
        optionKey: "jBpfuIE2acCo8z3wKNLl",
        label: "Gigi",
        metadata: { gender: "female", age: "young", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/jBpfuIE2acCo8z3wKNLl/5f1e3a27-88a2-4b2f-8668-a1e9c9e99f62.mp3" },
    },
    {
        optionKey: "oWAxZDx7w5VEj9dCyTzz",
        label: "Grace",
        metadata: { gender: "female", age: "young", accent: "southern-american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/oWAxZDx7w5VEj9dCyTzz/8f091240-558a-4d8b-abd8-284b25fe39de.mp3" },
    },
    {
        optionKey: "SOYHLrjzK2X1ezoPC6cr",
        label: "Harry",
        metadata: { gender: "male", age: "young", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/SOYHLrjzK2X1ezoPC6cr/03fe3f2e-2cf2-4e78-9714-7db7e0f2d53a.mp3" },
    },
    {
        optionKey: "bVMeCyTHy58xNoL34h3p",
        label: "Jeremy",
        metadata: { gender: "male", age: "young", accent: "american-irish", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/bVMeCyTHy58xNoL34h3p/66c47d58-4f7a-4e4d-a1b0-f33ce8a7e3d0.mp3" },
    },
    {
        optionKey: "XrExE9yKIg1WjnnlVkGX",
        label: "Matilda",
        metadata: { gender: "female", age: "middle-aged", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b4b5a57e-5e8e-4d2e-8e36-dd65e6a8b36c.mp3" },
    },
    {
        optionKey: "piTKgcLEGmPE4e6mEKli",
        label: "Nicole",
        metadata: { gender: "female", age: "young", accent: "american", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/piTKgcLEGmPE4e6mEKli/c269a54a-e2bc-44d0-bb46-4ed2666d6340.mp3" },
    },
    {
        optionKey: "pFZP5JQG7iQjIQuC4Bku",
        label: "Lily",
        metadata: { gender: "female", age: "middle-aged", accent: "british", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/e0b45450-78db-49b9-aaa4-d5358a6871bd.mp3" },
    },
    {
        optionKey: "t0jbNlBVZ17f02VDIeMI",
        label: "George",
        metadata: { gender: "male", age: "middle-aged", accent: "british", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/t0jbNlBVZ17f02VDIeMI/cbf28c8d-8047-4eb5-a9c1-af1fabe25f8a.mp3" },
    },
    {
        optionKey: "ThT5KcBeYPX3keUQqHPh",
        label: "Dorothy",
        metadata: { gender: "female", age: "young", accent: "british", languages: ["en"], preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/ThT5KcBeYPX3keUQqHPh/981f0855-6598-48d2-9f8f-b6d92fbbe3fc.mp3" },
    },
] as const;

// syncConfig for ElevenLabs /v1/voices — set on the Provider row for V1 cron
const ELEVENLABS_SYNC_CONFIG = JSON.stringify({
    auth: "none",           // GET /v1/voices is public, no auth header needed
    dataPath: "voices",     // response.voices → array of voice objects
    mapping: {
        optionKey:   "voice_id",
        label:       "name",
        metadata: {
            gender:      "labels.gender",
            age:         "labels.age",
            accent:      "labels.accent",
            languages:   "fine_tuning.language",
            preview_url: "preview_url",
        },
    },
    optionType: "voice",
});

async function main() {
    console.log(`Seeding ${VOICES.length} ElevenLabs voices...`);

    let upserted = 0;
    for (const voice of VOICES) {
        await prisma.providerOption.upsert({
            where: {
                providerId_skillId_optionType_optionKey: {
                    providerId: PROVIDER_ID,
                    skillId:    SKILL_ID,
                    optionType: OPTION_TYPE,
                    optionKey:  voice.optionKey,
                },
            },
            update: {
                label:       voice.label,
                metadata:    voice.metadata,
                isActive:    true,
                lastSyncedAt: new Date(),
            },
            create: {
                providerId:  PROVIDER_ID,
                skillId:     SKILL_ID,
                optionType:  OPTION_TYPE,
                optionKey:   voice.optionKey,
                label:       voice.label,
                metadata:    voice.metadata,
                isActive:    true,
            },
        });
        upserted++;
    }

    // Set syncEndpoint + syncConfig on the ElevenLabs provider for V1 cron
    await prisma.$executeRawUnsafe(
        `UPDATE "Provider" SET "syncEndpoint" = $1, "syncConfig" = $2 WHERE id = $3`,
        "https://api.elevenlabs.io/v1/voices",
        ELEVENLABS_SYNC_CONFIG,
        PROVIDER_ID,
    );

    console.log(`Done. ${upserted} voices upserted, syncConfig set on Provider ${PROVIDER_ID}.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
