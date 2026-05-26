#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const PROVIDER_ENDPOINT = "https://app.aporto.tech/api/providers/kie";

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeHappyHorse(config) {
    if (typeof config.model !== "string" || !config.model.startsWith("happyhorse/")) return [];
    const changes = [];
    const inputDefaults = isObject(config.inputDefaults) ? { ...config.inputDefaults } : {};

    if (typeof inputDefaults.quality === "string" && typeof inputDefaults.resolution !== "string") {
        inputDefaults.resolution = inputDefaults.quality;
        changes.push("happyhorse: quality -> resolution");
    }
    if ("quality" in inputDefaults) {
        delete inputDefaults.quality;
        changes.push("happyhorse: removed unsupported quality");
    }
    if (typeof inputDefaults.resolution !== "string") {
        inputDefaults.resolution = "720p";
        changes.push("happyhorse: added default resolution");
    }
    if (typeof inputDefaults.duration === "string") {
        const duration = Number(inputDefaults.duration);
        if (Number.isFinite(duration)) {
            inputDefaults.duration = duration;
            changes.push("happyhorse: duration string -> number");
        }
    }
    if (config.model !== "happyhorse/video-edit" && typeof inputDefaults.duration !== "number") {
        inputDefaults.duration = 5;
        changes.push("happyhorse: added default duration");
    }
    if (config.model !== "happyhorse/video-edit" && typeof inputDefaults.aspect_ratio !== "string") {
        inputDefaults.aspect_ratio = "16:9";
        changes.push("happyhorse: added default aspect_ratio");
    }
    if (config.model === "happyhorse/video-edit") {
        if ("duration" in inputDefaults) {
            delete inputDefaults.duration;
            changes.push("happyhorse video-edit: removed unsupported duration");
        }
        if ("aspect_ratio" in inputDefaults) {
            delete inputDefaults.aspect_ratio;
            changes.push("happyhorse video-edit: removed unsupported aspect_ratio");
        }
        if (typeof inputDefaults.audio_setting !== "string") {
            inputDefaults.audio_setting = "auto";
            changes.push("happyhorse video-edit: added audio_setting auto");
        }
    }

    config.inputDefaults = inputDefaults;
    return changes;
}

function normalizeNanoBanana2(config) {
    if (config.model !== "nano-banana-2") return [];
    const changes = [];
    const inputDefaults = isObject(config.inputDefaults) ? { ...config.inputDefaults } : {};
    if (typeof inputDefaults.quality === "string" && typeof inputDefaults.resolution !== "string") {
        inputDefaults.resolution = inputDefaults.quality.toUpperCase();
        changes.push("nano-banana-2: quality -> resolution");
    }
    if (!Array.isArray(inputDefaults.image_input)) {
        inputDefaults.image_input = [];
        changes.push("nano-banana-2: added image_input []");
    }
    if (typeof inputDefaults.output_format !== "string") {
        inputDefaults.output_format = "png";
        changes.push("nano-banana-2: added output_format png");
    }
    config.inputDefaults = inputDefaults;
    return changes;
}

function normalizeNanoBananaPro(config) {
    if (config.model !== "google/nano-banana-pro" && config.model !== "nano-banana-pro") return [];
    const changes = [];
    const inputDefaults = isObject(config.inputDefaults) ? { ...config.inputDefaults } : {};

    if (config.model !== "nano-banana-pro") {
        config.model = "nano-banana-pro";
        changes.push("nano-banana-pro: model google/nano-banana-pro -> nano-banana-pro");
    }
    if (typeof inputDefaults.quality === "string" && typeof inputDefaults.resolution !== "string") {
        inputDefaults.resolution = inputDefaults.quality.toUpperCase();
        changes.push("nano-banana-pro: quality -> resolution");
    }
    if ("quality" in inputDefaults) {
        delete inputDefaults.quality;
        changes.push("nano-banana-pro: removed unsupported quality");
    }
    if (typeof inputDefaults.resolution !== "string") {
        inputDefaults.resolution = "2K";
        changes.push("nano-banana-pro: added default resolution");
    }
    if (!Array.isArray(inputDefaults.image_input)) {
        inputDefaults.image_input = [];
        changes.push("nano-banana-pro: added image_input []");
    }
    if (typeof inputDefaults.output_format !== "string") {
        inputDefaults.output_format = "png";
        changes.push("nano-banana-pro: added output_format png");
    }

    config.inputDefaults = inputDefaults;
    return changes;
}

function normalizeGptImage15(config) {
    if (config.model !== "gpt-image/1.5-text-to-image" && config.model !== "gpt-image/1.5-image-to-image") return [];
    const changes = [];
    const inputDefaults = isObject(config.inputDefaults) ? { ...config.inputDefaults } : {};

    if (typeof inputDefaults.quality !== "string") {
        inputDefaults.quality = "high";
        changes.push("gpt-image-1.5: added default quality high");
    }
    if ("num_images" in inputDefaults) {
        delete inputDefaults.num_images;
        changes.push("gpt-image-1.5: removed unsupported num_images");
    }

    config.inputDefaults = inputDefaults;
    return changes;
}

function validateCommon(config) {
    const issues = [];
    if (config.requestType === "jobs.createTask") {
        if (typeof config.model !== "string" || !config.model.trim()) issues.push("missing jobs.createTask model");
        if (!isObject(config.inputDefaults)) issues.push("missing inputDefaults object");
    }
    if (config.requestType === "direct" && !isObject(config.bodyDefaults)) {
        issues.push("missing bodyDefaults object");
    }
    return issues;
}

function normalizeConfig(config) {
    const normalized = { ...config };
    const changes = [
        ...normalizeHappyHorse(normalized),
        ...normalizeNanoBanana2(normalized),
        ...normalizeNanoBananaPro(normalized),
        ...normalizeGptImage15(normalized),
    ];
    const issues = validateCommon(normalized);
    return { normalized, changes, issues };
}

async function main() {
    const rows = await prisma.$queryRawUnsafe(
        `SELECT p.id, p.name, p."isActive", p."syncConfig", s.name AS skill_name
         FROM "Provider" p
         JOIN "Skill" s ON s.id = p."skillId"
         WHERE p.endpoint = $1
         ORDER BY p.id`,
        PROVIDER_ENDPOINT,
    );

    const changed = [];
    const invalid = [];

    for (const row of rows) {
        let config;
        try {
            config = JSON.parse(row.syncConfig ?? "{}");
        } catch (error) {
            invalid.push({ id: row.id, provider: row.name, skill: row.skill_name, active: row.isActive, issues: [`invalid JSON: ${error.message}`] });
            continue;
        }

        const { normalized, changes, issues } = normalizeConfig(config);
        if (issues.length) invalid.push({ id: row.id, provider: row.name, skill: row.skill_name, active: row.isActive, issues });
        if (!changes.length) continue;

        changed.push({ id: row.id, provider: row.name, skill: row.skill_name, changes });
        if (APPLY) {
            await prisma.$executeRawUnsafe(
                `UPDATE "Provider" SET "syncConfig" = $1 WHERE id = $2`,
                JSON.stringify(normalized),
                row.id,
            );
        }
    }

    console.log(`KIE providers checked: ${rows.length}`);
    console.log(`Configs ${APPLY ? "updated" : "would update"}: ${changed.length}`);
    for (const item of changed) {
        console.log(`- #${item.id} ${item.skill} / ${item.provider}: ${item.changes.join("; ")}`);
    }
    const activeInvalid = invalid.filter((item) => item.active);
    const inactiveInvalid = invalid.filter((item) => !item.active);
    console.log(`Invalid active configs: ${activeInvalid.length}`);
    for (const item of activeInvalid) {
        console.log(`- #${item.id} ${item.skill} / ${item.provider}: ${item.issues.join("; ")}`);
    }
    console.log(`Invalid inactive configs: ${inactiveInvalid.length}`);
    for (const item of invalid) {
        if (item.active) continue;
        console.log(`- #${item.id} ${item.skill} / ${item.provider}: ${item.issues.join("; ")}`);
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
