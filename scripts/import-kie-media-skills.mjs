/**
 * KIE media catalog importer.
 *
 * Rules:
 *   - Import only image/video/music pricing rows; skip chat/LLM rows.
 *   - One Skill per KIE platform + operation + fixed quality/duration variant.
 *   - Each KIE pricing row becomes a Provider using the internal KIE wrapper.
 *   - Provider price is stored in USD. KIE states 1 credit ~= $0.005 USD.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-kie-media-skills.mjs
 *   node --env-file=.env.local scripts/import-kie-media-skills.mjs --apply
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const KIE_API_KEY = process.env.KIE_API_KEY;
const NEWAPI_URL = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;
const PROVIDER_ENDPOINT = "https://app.aporto.tech/api/providers/kie";
const PRICING_URL = "https://api.kie.ai/client/v1/model-pricing/page";
const CREDIT_TO_USD = 0.005;
const DEFAULT_VIDEO_SECONDS = 5;
const EMBED_DELAY_MS = 1700;

if (!KIE_API_KEY) throw new Error("KIE_API_KEY is required");

function titleCase(value) {
    return value
        .replace(/[-_/]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

function compact(value) {
    return value.replace(/\s+/g, " ").trim();
}

function parseUsd(row) {
    const raw = String(row.usdPrice ?? "").trim();
    const usd = raw ? Number(raw) : NaN;
    if (Number.isFinite(usd)) return usd;
    const credits = Number(String(row.creditPrice ?? "").trim());
    if (Number.isFinite(credits)) return credits * CREDIT_TO_USD;
    return 0;
}

function extractModel(row) {
    if (row.anchor) {
        try {
            const url = new URL(row.anchor);
            const model = url.searchParams.get("model");
            if (model) return model;
        } catch {
            // Fall through to description parsing.
        }
    }

    const desc = row.modelDescription.toLowerCase();
    const explicit = desc.match(/\b([a-z0-9-]+\/[a-z0-9-.]+(?:-[a-z0-9.]+)*)\b/i);
    if (explicit) return explicit[1];

    if (desc.includes("sora 2") && desc.includes("text-to-video")) return "sora-2/text-to-video";
    if (desc.includes("sora 2") && desc.includes("image-to-video")) return "sora-2/image-to-video";
    if (desc.includes("kling 2.6") && desc.includes("text-to-video")) return "kling-2.6/text-to-video";
    if (desc.includes("kling 2.6") && desc.includes("image-to-video")) return "kling-2.6/image-to-video";
    if (desc.includes("kling 3.0")) return "kling/kling-3.0";
    if (desc.includes("qwen2") && desc.includes("image edit")) return "qwen2/image-edit";
    if (desc.includes("qwen z-image")) return "z-image";
    if (desc.includes("qwen image") && desc.includes("text-to-image")) return "qwen/text-to-image";
    if (desc.includes("qwen image") && desc.includes("image-to-image")) return "qwen/image-to-image";
    if (desc.includes("recraft remove background")) return "recraft/remove-background";
    if (desc.includes("recraft crisp upscale")) return "recraft/crisp-upscale";
    if (desc.includes("google nano banana pro")) return "google/nano-banana-pro";
    if (desc.includes("google nano banana") && desc.includes("text-to-image")) return "google/nano-banana";
    if (desc.includes("google nano banana") && desc.includes("image-to-image")) return "google/nano-banana-edit";
    if (desc.includes("wan 2.2 animate") && desc.includes("replace")) return "wan/2-2-animate-replace";
    if (desc.includes("wan 2.2 animate") && desc.includes("move")) return "wan/2-2-animate-move";
    if (desc.includes("wan 2.2") && desc.includes("speech to video")) return "wan/2-2-a14b-speech-to-video-turbo";
    if (desc.includes("wan 2.2") && desc.includes("image-to-video")) return "wan/2-2-a14b-image-to-video-turbo";
    if (desc.includes("meigen-ai") || desc.includes("infinitetalk") || desc.includes("infinitalk")) return "infinitalk/from-audio";
    if (desc.includes("ideogram v3 reframe")) return "ideogram/v3-reframe";
    if (desc.includes("ideogram character")) return "ideogram/character";
    if (desc.includes("topaz image upscaler") || (desc.includes("topaz") && desc.includes("image-upscale"))) return "topaz/image-upscale";
    if (desc.includes("kling 2.6 motion control")) return "kling-2.6/motion-control";
    if (desc.includes("wan 2.7 image pro")) return "wan/2-7-image-pro";
    if (desc.includes("wan 2.7 image")) return "wan/2-7-image";
    if (desc.includes("google nano banana 2")) return "google/nano-banana-2";
    return null;
}

function platformName(row) {
    const text = row.modelDescription.toLowerCase();
    if (text.includes("sora")) return "Sora";
    if (text.includes("suno")) return "Suno";
    if (text.includes("runway")) return "Runway";
    if (text.includes("kling")) return "Kling";
    if (text.includes("hailuo")) return "Hailuo";
    if (text.includes("veo")) return "Veo";
    if (text.includes("4o image") || text.includes("openai 4o")) return "4o Image";
    if (text.includes("black forest labs")) return "Flux Kontext";
    if (text.includes("infinitetalk") || text.includes("infinitalk")) return "Infinitalk";
    if (text.includes("seedance") || text.includes("bytedance")) return "ByteDance";
    if (text.includes("seedream")) return "Seedream";
    if (text.includes("nano banana") || text.includes("imagen")) return "Google";
    if (text.includes("gpt image")) return "GPT Image";
    if (text.includes("wan")) return "Wan";
    if (text.includes("grok")) return "Grok Imagine";
    if (text.includes("qwen")) return "Qwen";
    if (text.includes("flux")) return "Flux";
    if (text.includes("recraft")) return "Recraft";
    if (text.includes("topaz")) return "Topaz";
    if (text.includes("elevenlabs")) return "ElevenLabs";
    if (text.includes("happyhorse")) return "HappyHorse";
    return row.provider || "KIE";
}

function operationName(row) {
    const text = row.modelDescription.toLowerCase();
    if (text.includes("text-to-video")) return "Text-to-Video";
    if (text.includes("text-to-vedio")) return "Text-to-Video";
    if (text.includes("image-to-video")) return "Image-to-Video";
    if (text.includes("image-to-vedio")) return "Image-to-Video";
    if (text.includes("video-to-video")) return "Video-to-Video";
    if (text.includes("reference-to-video") || text.includes("r2v")) return "Reference-to-Video";
    if (text.includes("videoedit") || text.includes("video-edit")) return "Video Edit";
    if (text.includes("extend")) return "Video Extend";
    if (text.includes("upscale")) return row.interfaceType === "image" ? "Image Upscale" : "Video Upscale";
    if (text.includes("remove background")) return "Background Removal";
    if (text.includes("reframe")) return "Image Reframe";
    if (text.includes("lip sync")) return "Lip Sync Video";
    if (text.includes("speech to video")) return "Speech-to-Video";
    if (text.includes("animate replace")) return "Animate Replace";
    if (text.includes("animate move")) return "Animate Move";
    if (text.includes("image-to-image")) return "Image-to-Image";
    if (text.includes("text-to-image")) return "Text-to-Image";
    if (text.includes("music style")) return "Music Style Boost";
    if (text.includes("text to dialogue")) return "Dialogue Audio";
    if (text.includes("speech-to-text")) return "Speech-to-Text";
    if (text.includes("text-to-speech")) return "Text-to-Speech";
    if (row.interfaceType === "music") return "Music Generation";
    if (row.interfaceType === "image") return "Image Generation";
    return "Video Generation";
}

function variantParts(row) {
    const desc = row.modelDescription;
    const text = desc.toLowerCase();
    const parts = [];

    const version = desc.match(/\b(v?\d+(?:\.\d+)?(?:\s?(?:lite|pro|fast|turbo|plus|master|standard))?)\b/i);
    if (version && !operationName(row).toLowerCase().includes(version[1].toLowerCase())) {
        parts.push(titleCase(version[1]));
    }

    const quality = desc.match(/\b(4k|2k|1k|1080p|720p|480p)\b/i);
    if (quality) parts.push(quality[1].toUpperCase());

    const duration = desc.match(/\b(\d+(?:\.\d+)?)s\b/i);
    if (duration && row.interfaceType === "video") parts.push(`${Number(duration[1])}s`);
    else if (row.interfaceType === "video" && String(row.creditUnit ?? "").toLowerCase().includes("per second")) {
        parts.push(`${DEFAULT_VIDEO_SECONDS}s`);
    }

    if (text.includes("with audio")) parts.push("With Audio");
    if (text.includes("without audio")) parts.push("Silent");
    if (text.includes("stable")) parts.push("Stable");
    if (text.includes("fast")) parts.push("Fast");
    if (text.includes("pro")) parts.push("Pro");
    if (text.includes("lite")) parts.push("Lite");

    return [...new Set(parts)];
}

function skillName(row) {
    const pieces = [platformName(row), operationName(row), ...variantParts(row)];
    return compact(pieces.join(" "));
}

function inferCategory(row) {
    if (row.interfaceType === "image") return "media/image";
    if (row.interfaceType === "video") return "media/video";
    return "media/music";
}

function capabilities(row) {
    const op = operationName(row).toLowerCase();
    const caps = ["create-media", `kie-${row.interfaceType}`];
    if (op.includes("text-to")) caps.push("generate-from-text");
    if (op.includes("image-to")) caps.push("generate-from-image");
    if (op.includes("video-to") || op.includes("video edit")) caps.push("transform-video");
    if (op.includes("upscale")) caps.push("upscale");
    if (op.includes("background")) caps.push("remove-background");
    if (op.includes("music")) caps.push("generate-music");
    if (op.includes("speech")) caps.push("speech");
    return [...new Set(caps)];
}

function inputTypes(row) {
    const op = operationName(row).toLowerCase();
    const types = [];
    if (op.includes("text")) types.push("text/prompt");
    if (op.includes("image")) types.push("url/image", "text/prompt");
    if (op.includes("video")) types.push("url/video", "text/prompt");
    if (row.interfaceType === "music") types.push("text/prompt", "url/audio");
    return [...new Set(types.length ? types : ["text/prompt"])];
}

function outputTypes(row) {
    if (row.interfaceType === "image") return ["task/image", "url/image", "text/json"];
    if (row.interfaceType === "video") return ["task/video", "url/video", "text/json"];
    return ["task/audio", "url/audio", "text/json"];
}

function durationSeconds(row) {
    const duration = row.modelDescription.match(/\b(\d+(?:\.\d+)?)s\b/i);
    if (duration) return Number(duration[1]);
    return DEFAULT_VIDEO_SECONDS;
}

function inputDefaults(row) {
    const text = row.modelDescription.toLowerCase();
    const defaults = {};

    const quality = row.modelDescription.match(/\b(4k|2k|1k|1080p|720p|480p)\b/i);
    if (quality) defaults.quality = quality[1].toLowerCase();

    if (row.interfaceType === "video") {
        defaults.duration = String(durationSeconds(row));
        if (text.includes("with audio")) defaults.sound = true;
        if (text.includes("without audio")) defaults.sound = false;
        defaults.aspect_ratio = "16:9";
    }

    if (row.interfaceType === "image") {
        defaults.num_images = "1";
        defaults.aspect_ratio = "1:1";
    }

    return defaults;
}

function requestConfig(row) {
    const text = row.modelDescription.toLowerCase();

    if (text === "kie media task status") {
        return {
            requestType: "jobs.recordInfo",
            apiPath: "/api/v1/jobs/recordInfo",
            method: "GET",
        };
    }

    if (text.includes("veo 3.1")) {
        const qualityModel = text.includes("lite") ? "veo3_lite" : text.includes("quality") ? "veo3" : "veo3_fast";
        const generationType = text.includes("reference-to-video")
            ? "REFERENCE_2_VIDEO"
            : text.includes("image-to")
            ? "FIRST_AND_LAST_FRAMES_2_VIDEO"
            : "TEXT_2_VIDEO";
        return {
            requestType: "direct",
            apiPath: "/api/v1/veo/generate",
            method: "POST",
            bodyDefaults: {
                model: qualityModel,
                generationType,
                aspectRatio: "16:9",
                enableTranslation: true,
                enableFallback: false,
            },
        };
    }

    if (text.includes("openai 4o image")) {
        return {
            requestType: "direct",
            apiPath: "/api/v1/gpt4o-image/generate",
            method: "POST",
            bodyDefaults: {
                size: "1:1",
                isEnhance: false,
                uploadCn: false,
                nVariants: 1,
                enableFallback: false,
            },
        };
    }

    if (text.includes("black forest labs flux1-kontext")) {
        return {
            requestType: "direct",
            apiPath: "/api/v1/flux/kontext/generate",
            method: "POST",
            bodyDefaults: {
                model: text.includes("max") ? "flux-kontext-max" : "flux-kontext-pro",
                aspectRatio: "1:1",
                outputFormat: "jpeg",
                promptUpsampling: false,
                enableTranslation: true,
            },
        };
    }

    if (text.includes("runway aleph")) {
        return {
            requestType: "direct",
            apiPath: "/api/v1/aleph/generate",
            method: "POST",
            bodyDefaults: { uploadCn: false, waterMark: "" },
        };
    }

    if (text.includes("runway,")) {
        const duration = durationSeconds(row);
        const quality = row.modelDescription.match(/\b(1080p|720p)\b/i)?.[1].toLowerCase() ?? "720p";
        return {
            requestType: "direct",
            apiPath: "/api/v1/runway/generate",
            method: "POST",
            bodyDefaults: {
                model: `runway-duration-${duration}-generate`,
                duration,
                quality,
                aspectRatio: "16:9",
                waterMark: "",
            },
        };
    }

    if (row.interfaceType === "music" && text.includes("suno")) {
        if (text.includes("boost music style")) {
            return {
                requestType: "suno.direct",
                apiPath: "/api/v1/style/generate",
                method: "POST",
                bodyDefaults: {},
            };
        }
        return {
            requestType: "suno.direct",
            apiPath: "/api/v1/generate",
            method: "POST",
            bodyDefaults: { model: "V5", customMode: false, instrumental: false },
        };
    }

    return {
        requestType: "jobs.createTask",
        apiPath: "/api/v1/jobs/createTask",
        method: "POST",
        model: extractModel(row),
        inputDefaults: inputDefaults(row),
    };
}

function paramsSchema(row) {
    const op = operationName(row).toLowerCase();
    const schema = {
        prompt: "string — media generation/editing prompt",
        callBackUrl: "string — optional HTTPS webhook URL for KIE completion callbacks",
    };
    if (op.includes("image-to") || op.includes("reference-to")) {
        schema.image_urls = "array of strings — source/reference image URLs";
    }
    if (op.includes("video-to") || op.includes("video edit") || op.includes("extend") || op.includes("upscale")) {
        schema.video_url = "string — source video URL or taskId when required by the KIE model";
        schema.task_id = "string — previous KIE task id when the model requires it";
    }
    if (row.interfaceType === "music") {
        schema.style = "string — optional style/genre guidance";
        schema.title = "string — optional track title";
        schema.audio_url = "string — optional source audio URL for audio transform skills";
    }
    schema.fixedVariant = `This skill is priced for: ${row.modelDescription}`;
    return schema;
}

function description(row) {
    const price = priceForRow(row);
    const variant = row.modelDescription;
    return compact(
        `${skillName(row)} via KIE. Creates ${row.interfaceType} media using the fixed KIE pricing variant "${variant}". ` +
        `The provider submits an asynchronous KIE task and returns taskId; poll with the KIE Media Task Status skill or use callBackUrl. ` +
        `Current imported price: $${price.pricePerCall.toFixed(4)} ${price.priceNote}.`,
    );
}

function priceForRow(row) {
    const unitUsd = parseUsd(row);
    const unit = String(row.creditUnit ?? "").toLowerCase();
    if (unit.includes("per second")) {
        const seconds = durationSeconds(row);
        return {
            pricePerCall: unitUsd * seconds,
            costPerChar: null,
            priceNote: `(${unitUsd.toFixed(4)}/sec x ${seconds}s)`,
        };
    }
    if (unit.includes("per 1000 characters")) {
        return {
            pricePerCall: 0,
            costPerChar: unitUsd / 1000,
            priceNote: `(${unitUsd.toFixed(4)}/1k chars)`,
        };
    }
    return { pricePerCall: unitUsd, costPerChar: null, priceNote: "(per request)" };
}

function tags(row) {
    return [
        "kie",
        row.interfaceType,
        platformName(row).toLowerCase().replace(/\s+/g, "-"),
        operationName(row).toLowerCase().replace(/\s+/g, "-"),
    ];
}

function buildEmbedText(skill) {
    return [
        `category:${skill.category}`,
        `capabilities:${skill.capabilities.join(",")}`,
        `input:${skill.inputTypes.join(",")}`,
        `output:${skill.outputTypes.join(",")}`,
        `${skill.name}: ${skill.description}`,
    ].join(" ");
}

async function embedText(text) {
    if (!NEWAPI_ADMIN_KEY) return null;
    for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, EMBED_DELAY_MS * (attempt + 1)));
        const res = await fetch(`${NEWAPI_URL}/v1/embeddings`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${NEWAPI_ADMIN_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
        });
        if (res.ok) {
            const data = await res.json();
            await new Promise((resolve) => setTimeout(resolve, EMBED_DELAY_MS));
            return data.data[0].embedding;
        }
        const detail = await res.text();
        if (res.status !== 429 || attempt === 3) throw new Error(`Embed error ${res.status}: ${detail}`);
    }
    return null;
}

async function fetchPricingPage(pageNum) {
    const res = await fetch(PRICING_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageNum, pageSize: 100, modelDescription: "", interfaceType: "" }),
    });
    if (!res.ok) throw new Error(`KIE pricing HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== 200) throw new Error(`KIE pricing error ${data.code}: ${data.msg}`);
    return data.data;
}

async function fetchPricingRows() {
    const first = await fetchPricingPage(1);
    const rows = [...first.records];
    for (let page = 2; page <= first.pages; page++) {
        const next = await fetchPricingPage(page);
        rows.push(...next.records);
    }
    return rows;
}

async function upsertSkill(skill) {
    const existing = await prisma.$queryRawUnsafe(
        `SELECT id, (embedding IS NOT NULL) AS has_embedding FROM "Skill" WHERE name = $1 LIMIT 1`,
        skill.name,
    );
    const existingHasEmbedding = Boolean(existing[0]?.has_embedding);
    const embedding = existingHasEmbedding ? null : await embedText(buildEmbedText(skill));
    const vectorLiteral = embedding ? `[${embedding.join(",")}]` : null;

    if (existing.length) {
        const id = existing[0].id;
        if (embedding) {
            await prisma.$executeRawUnsafe(
                `UPDATE "Skill"
                 SET description = $2, category = $3, capabilities = $4,
                     "inputTypes" = $5, "outputTypes" = $6, tags = $7,
                     "paramsSchema" = $8, embedding = $9::vector,
                     status = 'live', "isActive" = true
                 WHERE id = $1`,
                id,
                skill.description,
                skill.category,
                JSON.stringify(skill.capabilities),
                JSON.stringify(skill.inputTypes),
                JSON.stringify(skill.outputTypes),
                JSON.stringify(skill.tags),
                JSON.stringify(skill.paramsSchema),
                vectorLiteral,
            );
        } else {
            await prisma.$executeRawUnsafe(
                `UPDATE "Skill"
                 SET description = $2, category = $3, capabilities = $4,
                     "inputTypes" = $5, "outputTypes" = $6, tags = $7,
                     "paramsSchema" = $8, status = 'live', "isActive" = true
                 WHERE id = $1`,
                id,
                skill.description,
                skill.category,
                JSON.stringify(skill.capabilities),
                JSON.stringify(skill.inputTypes),
                JSON.stringify(skill.outputTypes),
                JSON.stringify(skill.tags),
                JSON.stringify(skill.paramsSchema),
            );
        }
        return id;
    }

    const rows = embedding
        ? await prisma.$queryRawUnsafe(
            `INSERT INTO "Skill" (name, description, category, capabilities, "inputTypes", "outputTypes", tags, "paramsSchema", embedding, status, "isActive", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, 'live', true, NOW())
             RETURNING id`,
            skill.name,
            skill.description,
            skill.category,
            JSON.stringify(skill.capabilities),
            JSON.stringify(skill.inputTypes),
            JSON.stringify(skill.outputTypes),
            JSON.stringify(skill.tags),
            JSON.stringify(skill.paramsSchema),
            vectorLiteral,
        )
        : await prisma.$queryRawUnsafe(
            `INSERT INTO "Skill" (name, description, category, capabilities, "inputTypes", "outputTypes", tags, "paramsSchema", status, "isActive", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'live', true, NOW())
             RETURNING id`,
            skill.name,
            skill.description,
            skill.category,
            JSON.stringify(skill.capabilities),
            JSON.stringify(skill.inputTypes),
            JSON.stringify(skill.outputTypes),
            JSON.stringify(skill.tags),
            JSON.stringify(skill.paramsSchema),
        );
    return rows[0].id;
}

async function upsertProvider(skillId, row) {
    const providerName = `KIE - ${row.modelDescription}`;
    const price = priceForRow(row);
    const config = requestConfig(row);
    const syncConfig = JSON.stringify({
        ...config,
        pricing: {
            modelDescription: row.modelDescription,
            interfaceType: row.interfaceType,
            provider: row.provider,
            creditPrice: row.creditPrice,
            creditUnit: row.creditUnit,
            usdPrice: row.usdPrice,
            pricePerCall: price.pricePerCall,
            costPerChar: price.costPerChar,
            source: "https://kie.ai/pricing",
            importedAt: new Date().toISOString(),
        },
    });

    const existing = await prisma.$queryRawUnsafe(
        `SELECT id FROM "Provider" WHERE "skillId" = $1 AND name = $2 LIMIT 1`,
        skillId,
        providerName,
    );

    if (existing.length) {
        await prisma.$executeRawUnsafe(
            `UPDATE "Provider"
             SET endpoint = $2, "pricePerCall" = $3, "costPerChar" = $4,
                 "providerSecret" = $5, "syncConfig" = $6, "isActive" = true
             WHERE id = $1`,
            existing[0].id,
            PROVIDER_ENDPOINT,
            price.pricePerCall,
            price.costPerChar,
            KIE_API_KEY,
            syncConfig,
        );
        return existing[0].id;
    }

    const rows = await prisma.$queryRawUnsafe(
        `INSERT INTO "Provider" (name, "skillId", endpoint, "isActive", "pricePerCall", "costPerChar", "providerSecret", "syncConfig", "createdAt")
         VALUES ($1, $2, $3, true, $4, $5, $6, $7, NOW())
         RETURNING id`,
        providerName,
        skillId,
        PROVIDER_ENDPOINT,
        price.pricePerCall,
        price.costPerChar,
        KIE_API_KEY,
        syncConfig,
    );
    return rows[0].id;
}

async function main() {
    const rows = await fetchPricingRows();
    const mediaRows = rows
        .filter((row) => ["image", "video", "music"].includes(row.interfaceType))
        .filter((row) => parseUsd(row) > 0 || Number(String(row.creditPrice ?? "").trim()) > 0);

    const skipped = [];
    const skills = new Map();
    for (const row of mediaRows) {
        const config = requestConfig(row);
        if (row.interfaceType !== "music" && config.requestType === "jobs.createTask" && !config.model) {
            skipped.push({ modelDescription: row.modelDescription, reason: "missing model id" });
            continue;
        }

        const name = skillName(row);
        if (!skills.has(name)) {
            skills.set(name, {
                name,
                description: description(row),
                category: inferCategory(row),
                capabilities: capabilities(row),
                inputTypes: inputTypes(row),
                outputTypes: outputTypes(row),
                tags: tags(row),
                paramsSchema: paramsSchema(row),
                rows: [],
            });
        }
        skills.get(name).rows.push(row);
    }

    console.log(`KIE pricing rows: ${rows.length}`);
    console.log(`Media rows: ${mediaRows.length}`);
    console.log(`Skills to ${APPLY ? "upsert" : "preview"}: ${skills.size}`);
    console.log(`Skipped: ${skipped.length}`);

    for (const skill of skills.values()) {
        console.log(`- ${skill.name} (${skill.rows.length} provider${skill.rows.length === 1 ? "" : "s"})`);
        if (!APPLY) continue;
        const skillId = await upsertSkill(skill);
        for (const row of skill.rows) {
            await upsertProvider(skillId, row);
        }
    }

    const statusSkill = {
        name: "KIE Media Task Status",
        description: "Check KIE media generation task status and retrieve final image, video, or audio result URLs. Use this after KIE async generation skills return a taskId.",
        category: "media/task",
        capabilities: ["check-task-status", "retrieve-media-result", "poll-async-generation", "kie-media"],
        inputTypes: ["text/task-id"],
        outputTypes: ["task/status", "url/media", "text/json"],
        tags: ["kie", "task-status", "media", "async"],
        paramsSchema: {
            taskId: "string — KIE taskId returned by a KIE image/video/music generation skill",
        },
        rows: [{
            modelDescription: "KIE Media Task Status",
            interfaceType: "media",
            provider: "KIE",
            creditPrice: "0",
            creditUnit: "per request",
            usdPrice: "0",
            anchor: "https://docs.kie.ai/market/common/get-task-detail",
        }],
    };

    console.log(`- ${statusSkill.name} (1 provider)`);
    if (APPLY) {
        const skillId = await upsertSkill(statusSkill);
        await upsertProvider(skillId, statusSkill.rows[0]);
    }

    if (skipped.length) {
        console.log("Skipped rows:");
        for (const row of skipped.slice(0, 50)) console.log(`- ${row.modelDescription}: ${row.reason}`);
        if (skipped.length > 50) console.log(`... ${skipped.length - 50} more`);
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
