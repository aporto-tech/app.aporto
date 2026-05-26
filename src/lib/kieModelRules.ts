import rules from "@/lib/kie-model-rules.json";

type KieModelRule = {
    id: string;
    model?: string;
    modelAliases?: Record<string, string>;
    modelExact?: string[];
    modelPrefixes?: string[];
    qualityToResolution?: "upper" | "lower";
    removeInputKeys?: string[];
    coerceNumberKeys?: string[];
    defaults?: Record<string, unknown>;
    modelOverrides?: Record<string, {
        removeInputKeys?: string[];
        defaults?: Record<string, unknown>;
    }>;
};

const KIE_MODEL_RULES = rules as KieModelRule[];

function modelMatches(rule: KieModelRule, model: string): boolean {
    return Boolean(rule.modelExact?.includes(model))
        || Boolean(rule.modelPrefixes?.some((prefix) => model.startsWith(prefix)));
}

export function canonicalKieModel(model: string): string {
    for (const rule of KIE_MODEL_RULES) {
        const alias = rule.modelAliases?.[model];
        if (alias) return alias;
    }
    return model;
}

function ruleForModel(model: string): KieModelRule | undefined {
    const canonical = canonicalKieModel(model);
    return KIE_MODEL_RULES.find((rule) => modelMatches(rule, canonical) || modelMatches(rule, model));
}

function applyDefaults(target: Record<string, unknown>, defaults?: Record<string, unknown>) {
    if (!defaults) return;
    for (const [key, value] of Object.entries(defaults)) {
        target[key] ??= Array.isArray(value) ? [...value] : value;
    }
}

function applyRemovals(target: Record<string, unknown>, keys?: string[]) {
    for (const key of keys ?? []) {
        delete target[key];
    }
}

function coerceNumbers(target: Record<string, unknown>, keys?: string[]) {
    for (const key of keys ?? []) {
        if (typeof target[key] !== "string") continue;
        const parsed = Number(target[key]);
        if (Number.isFinite(parsed)) target[key] = parsed;
    }
}

export function normalizeKieCreateTaskInput(model: string, input: Record<string, unknown>): Record<string, unknown> {
    const canonicalModel = canonicalKieModel(model);
    const rule = ruleForModel(canonicalModel);
    const normalized = { ...input };

    if (!rule) return normalized;

    if (typeof normalized.quality === "string" && typeof normalized.resolution !== "string") {
        if (rule.qualityToResolution === "upper") normalized.resolution = normalized.quality.toUpperCase();
        if (rule.qualityToResolution === "lower") normalized.resolution = normalized.quality.toLowerCase();
    }

    applyDefaults(normalized, rule.defaults);
    applyRemovals(normalized, rule.removeInputKeys);
    coerceNumbers(normalized, rule.coerceNumberKeys);

    const override = rule.modelOverrides?.[canonicalModel] ?? rule.modelOverrides?.[model];
    if (override) {
        applyDefaults(normalized, override.defaults);
        applyRemovals(normalized, override.removeInputKeys);
    }

    return normalized;
}
