#!/usr/bin/env node

// Quick script to regenerate embedding for Skill ID 5 (Text to Speech)

const skillId = 5;
const skillText = `Text to Speech. Convert text to natural-sounding audio and voice using ElevenLabs. Generates MP3 audio files with multiple voice options. Audio synthesis and voice generation for narration, podcasts, and voiceovers. NOT video generation.`;

const apiKey = process.env.NEWAPI_ADMIN_KEY || "sk-mCPnqr2JA2OQob4jLL4yL6u3RCZCFlioNTZiiA30unjHJsYN";
const baseUrl = process.env.NEWAPI_URL || "https://api.aporto.tech";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres.rsejjhpkvyaugcbsbzvh:jQoZGyFEEZRKdOdn@aws-1-eu-north-1.pooler.supabase.com:5432/postgres";

(async () => {
    // Step 1: Generate embedding
    console.log(`Generating embedding for Skill ID ${skillId}...`);
    const embRes = await fetch(`${baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "text-embedding-3-small",
            input: skillText,
        }),
    });

    if (!embRes.ok) {
        const err = await embRes.text();
        console.error(`Embeddings error ${embRes.status}: ${err}`);
        process.exit(1);
    }

    const embData = await embData.json();
    const embedding = embData.data[0].embedding;
    console.log(`✓ Generated ${embedding.length}-dim embedding`);

    // Step 2: Update DB
    console.log(`Updating Skill ID ${skillId} in database...`);
    const { exec } = require("child_process");
    const sql = `UPDATE "Skill" SET embedding = '[${embedding.join(",")}]'::vector WHERE id = ${skillId};`;

    exec(`psql "${databaseUrl}" -c "${sql}"`, (err, stdout, stderr) => {
        if (err) {
            console.error("DB error:", err);
            process.exit(1);
        }
        console.log(`✓ Updated Skill ID ${skillId} embedding`);
        console.log(stdout);
    });
})().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
