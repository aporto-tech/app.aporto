#!/usr/bin/env node
/**
 * Quick diagnostic: test discoverSkills("image generation")
 * Run: node scripts/test-discovery.mjs
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });
config({ path: join(__dirname, "../.env") });

const NEWAPI_URL = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY ?? process.env.NEWAPI_ADMIN_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!NEWAPI_ADMIN_KEY) { console.error("❌ NEWAPI_ADMIN_KEY / NEWAPI_ADMIN_TOKEN not set"); process.exit(1); }
if (!DATABASE_URL) { console.error("❌ DATABASE_URL not set"); process.exit(1); }

// ── 1. Embedding via fetch ───────────────────────────────────────────────────
async function embedQuery(text) {
    const res = await fetch(`${NEWAPI_URL}/v1/embeddings`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${NEWAPI_ADMIN_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    if (!res.ok) throw new Error(`Embeddings error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.data[0].embedding;
}

// ── 2. DB via psql ──────────────────────────────────────────────────────────
function psql(sql) {
    try {
        const out = execSync(
            `psql "${DATABASE_URL}" -t -A -F '|'`,
            { input: sql, stdio: ["pipe", "pipe", "pipe"] }
        ).toString().trim();
        return out;
    } catch (e) {
        throw new Error(`psql failed: ${e.stderr?.toString() || e.message}`);
    }
}

async function run() {
    const query = "image generation";
    console.log(`\n🔍 Testing discoverSkills("${query}")\n`);

    // Step 1: embed
    console.log("1. Embedding query...");
    let embedding;
    try {
        embedding = await embedQuery(query);
        console.log(`   ✅ Got embedding, dim=${embedding.length}, first5=[${embedding.slice(0,5).map(v=>v.toFixed(4)).join(", ")}]`);
    } catch (e) {
        console.error(`   ❌ Embedding failed: ${e.message}`);
        process.exit(1);
    }

    // Step 2: check DB skills with embedding
    console.log("\n2. Checking live skills with embeddings...");
    try {
        const countOut = psql(`
            SELECT COUNT(*) as total,
                   COUNT(embedding) as with_embedding,
                   COUNT(CASE WHEN status = 'live' THEN 1 END) as live,
                   COUNT(CASE WHEN status = 'live' AND embedding IS NOT NULL THEN 1 END) as live_with_emb,
                   COUNT(CASE WHEN status = 'live' AND embedding IS NOT NULL AND "isActive" = true THEN 1 END) as live_active_emb
            FROM "Skill"
        `);
        const [total, with_embedding, live, live_with_emb, live_active_emb] = countOut.split("|");
        console.log(`   Total skills: ${total}`);
        console.log(`   With embedding: ${with_embedding}`);
        console.log(`   Live: ${live}`);
        console.log(`   Live + embedding: ${live_with_emb}`);
        console.log(`   Live + embedding + isActive: ${live_active_emb}`);

        const provOut = psql(`
            SELECT COUNT(DISTINCT s.id) as skills_with_active_provider
            FROM "Skill" s
            WHERE s.status = 'live' AND s.embedding IS NOT NULL AND s."isActive" = true
              AND EXISTS (SELECT 1 FROM "Provider" p WHERE p."skillId" = s.id AND p."isActive" = true)
        `);
        console.log(`   Live + embedding + isActive + active provider: ${provOut.trim()}`);
    } catch (e) {
        console.error(`   ❌ DB query failed: ${e.message}`);
        process.exit(1);
    }

    // Step 3: run actual vector search
    console.log("\n3. Running vector search...");
    try {
        const vectorLiteral = `[${embedding.join(",")}]`;
        const searchOut = psql(`
            SELECT id, name, category, 1 - (embedding <=> '${vectorLiteral}'::vector) AS similarity
            FROM "Skill"
            WHERE "isActive" = true
              AND embedding IS NOT NULL
              AND status = 'live'
              AND EXISTS (SELECT 1 FROM "Provider" p WHERE p."skillId" = "Skill".id AND p."isActive" = true)
            ORDER BY embedding <=> '${vectorLiteral}'::vector
            LIMIT 10
        `);
        if (!searchOut) {
            console.log("   ❌ NO RESULTS from vector search");
        } else {
            const rows = searchOut.split("\n").filter(Boolean);
            console.log(`   ✅ Got ${rows.length} results:`);
            rows.forEach((row, i) => {
                const [id, name, category, sim] = row.split("|");
                console.log(`   ${i+1}. [${parseFloat(sim).toFixed(4)}] ${name} (${category})`);
            });
        }
    } catch (e) {
        console.error(`   ❌ Vector search failed: ${e.message}`);
    }

    // Step 4: check image category specifically
    console.log("\n4. Checking media/image skills...");
    try {
        const imgOut = psql(`
            SELECT id, name, status, "isActive",
                   (embedding IS NOT NULL) as has_embedding,
                   EXISTS (SELECT 1 FROM "Provider" p WHERE p."skillId" = "Skill".id AND p."isActive" = true) as has_provider
            FROM "Skill"
            WHERE category = 'media/image'
            ORDER BY id
            LIMIT 20
        `);
        if (!imgOut) {
            console.log("   ❌ No skills with category='media/image'");
        } else {
            const rows = imgOut.split("\n").filter(Boolean);
            console.log(`   Found ${rows.length} media/image skills:`);
            rows.forEach(row => {
                const [id, name, status, isActive, has_embedding, has_provider] = row.split("|");
                const flags = [
                    status === 'live' ? '✅live' : `❌${status}`,
                    isActive === 't' ? '✅active' : '❌inactive',
                    has_embedding === 't' ? '✅emb' : '❌no-emb',
                    has_provider === 't' ? '✅prov' : '❌no-prov',
                ].join(' ');
                console.log(`   - ${name}: ${flags}`);
            });
        }
    } catch (e) {
        console.error(`   ❌ Image skills query failed: ${e.message}`);
    }

    console.log("\n✅ Done\n");
}

run().catch(e => { console.error(e); process.exit(1); });
