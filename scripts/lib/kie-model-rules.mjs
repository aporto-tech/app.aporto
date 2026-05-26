import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.resolve(__dirname, "../../src/lib/kie-model-rules.json");
export const kieModelRules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));

function normalizedText(value) {
    return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function ruleMatchesDescription(rule, description) {
    const text = normalizedText(description);
    const patterns = rule.descriptionPatterns ?? [];
    return patterns.length > 0 && patterns.every((pattern) => text.includes(normalizedText(pattern)));
}

export function kieModelAliasForDescription(description) {
    const rule = kieModelRules.find((item) => item.model && ruleMatchesDescription(item, description));
    return rule?.model ?? null;
}

export function canonicalKieModel(model) {
    if (typeof model !== "string" || !model) return model;
    for (const rule of kieModelRules) {
        const alias = rule.modelAliases?.[model];
        if (alias) return alias;
    }
    return model;
}

function modelMatches(rule, model) {
    if (typeof model !== "string" || !model) return false;
    return Boolean(rule.modelExact?.includes(model))
        || Boolean(rule.modelPrefixes?.some((prefix) => model.startsWith(prefix)));
}

function ruleForModel(model) {
    const canonical = canonicalKieModel(model);
    return kieModelRules.find((rule) => modelMatches(rule, canonical) || modelMatches(rule, model));
}

function applyDefaults(target, defaults) {
    if (!defaults) return;
    for (const [key, value] of Object.entries(defaults)) {
        if (target[key] == null) target[key] = Array.isArray(value) ? [...value] : value;
    }
}

function applyDescriptionDefaults(target, description, rule) {
    const text = normalizedText(description);
    for (const [key, specs] of Object.entries(rule.descriptionDefaultFields ?? {})) {
        for (const spec of specs) {
            if (text.includes(normalizedText(spec.pattern))) {
                target[key] = spec.value;
                break;
            }
        }
    }
}

function applyRemovals(target, keys) {
    for (const key of keys ?? []) delete target[key];
}

function coerceNumbers(target, keys) {
    for (const key of keys ?? []) {
        if (typeof target[key] !== "string") continue;
        const parsed = Number(target[key]);
        if (Number.isFinite(parsed)) target[key] = parsed;
    }
}

export function normalizeKieInputDefaults(model, defaults, description = "") {
    if (typeof model !== "string" || !model) return { ...(defaults ?? {}) };
    const canonical = canonicalKieModel(model);
    const rule = ruleForModel(canonical);
    const normalized = { ...(defaults ?? {}) };
    if (!rule) return normalized;

    if (typeof normalized.quality === "string" && typeof normalized.resolution !== "string") {
        if (rule.qualityToResolution === "upper") normalized.resolution = normalized.quality.toUpperCase();
        if (rule.qualityToResolution === "lower") normalized.resolution = normalized.quality.toLowerCase();
    }

    applyDefaults(normalized, rule.defaults);
    applyDescriptionDefaults(normalized, description, rule);
    applyRemovals(normalized, rule.removeInputKeys);
    coerceNumbers(normalized, rule.coerceNumberKeys);

    const override = rule.modelOverrides?.[canonical] ?? rule.modelOverrides?.[model];
    if (override) {
        applyDefaults(normalized, override.defaults);
        applyRemovals(normalized, override.removeInputKeys);
    }

    return normalized;
}

export function normalizeKieProviderConfig(config, description = "") {
    const normalized = { ...config };
    if (typeof normalized.model === "string") {
        normalized.model = canonicalKieModel(normalized.model);
        normalized.inputDefaults = normalizeKieInputDefaults(normalized.model, normalized.inputDefaults, description);
    }
    return normalized;
}
