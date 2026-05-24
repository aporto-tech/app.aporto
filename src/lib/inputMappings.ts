type InputMappings = Record<string, string[]>;

const SEMANTIC_ALIASES: InputMappings = {
    query: [
        "query",
        "searchQuery",
        "search",
        "keyword",
        "term",
        "searchString",
        "searchStringsArray",
        "queries",
    ],
    limit: [
        "maxResults",
        "maxItems",
        "limit",
        "resultsLimit",
        "maxCrawledPlaces",
        "maxCrawledPlacesPerSearch",
        "maxPlacesPerSearch",
        "maxTotalPlaces",
        "totalMaxPlaces",
        "count",
        "pageSize",
        "numResults",
        "resultsCount",
        "maximumResults",
    ],
    url: [
        "url",
        "urls",
        "startUrl",
        "startUrls",
        "link",
        "links",
        "profileUrl",
        "profileUrls",
        "companyUrl",
        "companyUrls",
        "jobUrl",
        "jobUrls",
    ],
    location: ["location", "city", "area", "country", "address", "place"],
    text: ["text", "prompt", "input", "content", "message"],
};

export const DEFAULT_APIFY_INPUT_MAPPINGS: InputMappings = {
    query: ["query", "searchQuery", "keyword", "searchStringsArray"],
    limit: ["maxResults", "maxItems", "limit", "resultsLimit"],
    url: ["url", "urls", "startUrls"],
    location: ["location", "city", "area"],
};

export function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] | null {
    if (Array.isArray(value)) {
        const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
        return values.length ? values : null;
    }
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return null;
}

function numberValue(value: unknown): number | null {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function valueForTarget(target: string, value: unknown): unknown {
    if (/urls?|startUrls|profileUrls|companyUrls|jobUrls|searchStringsArray|queries/i.test(target)) {
        return toStringArray(value) ?? value;
    }
    if (/max|limit|count|pageSize|numResults|results/i.test(target)) {
        return numberValue(value) ?? value;
    }
    return value;
}

function firstPresent(params: Record<string, unknown>, fields: string[]): unknown {
    for (const field of fields) {
        const value = params[field];
        if (value == null) continue;
        if (typeof value === "string" && !value.trim()) continue;
        if (Array.isArray(value) && value.length === 0) continue;
        return value;
    }
    return undefined;
}

function configuredMappings(syncConfig: Record<string, unknown> | null): InputMappings {
    const value = syncConfig?.inputMappings;
    if (!isObject(value)) return {};
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, targets]) => Array.isArray(targets))
            .map(([semantic, targets]) => [
                semantic,
                (targets as unknown[]).filter((target): target is string => typeof target === "string" && target.trim().length > 0),
            ])
            .filter(([, targets]) => targets.length > 0),
    );
}

export function applyProviderInputMappings(
    params: Record<string, unknown>,
    syncConfig: Record<string, unknown> | null,
): Record<string, unknown> {
    const mappings = configuredMappings(syncConfig);
    if (!Object.keys(mappings).length) return params;

    const mapped = { ...params };
    for (const [semantic, targets] of Object.entries(mappings)) {
        const sourceFields = SEMANTIC_ALIASES[semantic] ?? [semantic];
        const value = firstPresent(mapped, sourceFields);
        if (value === undefined) continue;

        for (const target of targets) {
            if (mapped[target] !== undefined) continue;
            mapped[target] = valueForTarget(target, value);
        }
    }
    return mapped;
}

export function buildApifyInputMappings(inputSchema?: unknown): InputMappings {
    const schema = isObject(inputSchema) ? inputSchema : null;
    const properties = schema && isObject(schema.properties) ? schema.properties : null;
    const fields = properties ? Object.keys(properties) : [];
    const bySemantic: InputMappings = {};

    for (const [semantic, aliases] of Object.entries(SEMANTIC_ALIASES)) {
        const matches = fields.filter((field) => aliases.some((alias) => alias.toLowerCase() === field.toLowerCase()));
        if (matches.length) bySemantic[semantic] = matches;
    }

    return {
        ...DEFAULT_APIFY_INPUT_MAPPINGS,
        ...bySemantic,
    };
}
