const DEFAULT_APIFY_INPUT_MAPPINGS = {
    query: ["query", "searchQuery", "keyword", "searchStringsArray"],
    limit: ["maxResults", "maxItems", "limit", "resultsLimit"],
    url: ["url", "urls", "startUrls"],
    location: ["location", "city", "area"],
};

const SEMANTIC_ALIASES = {
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

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonMaybe(value) {
    if (isObject(value)) return value;
    if (typeof value !== "string" || !value.trim()) return null;
    try {
        const parsed = JSON.parse(value);
        return isObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

export function normalizeApifyInputSchema(value) {
    const schema = parseJsonMaybe(value);
    if (!schema) return null;
    return isObject(schema.properties) ? schema : null;
}

export function buildApifyInputMappings(inputSchema) {
    const schema = normalizeApifyInputSchema(inputSchema);
    const properties = isObject(schema?.properties) ? schema.properties : null;
    const fields = properties ? Object.keys(properties) : [];
    const bySemantic = {};

    for (const [semantic, aliases] of Object.entries(SEMANTIC_ALIASES)) {
        const matches = fields.filter((field) => aliases.some((alias) => alias.toLowerCase() === field.toLowerCase()));
        if (matches.length) bySemantic[semantic] = matches;
    }

    return {
        ...DEFAULT_APIFY_INPUT_MAPPINGS,
        ...Object.fromEntries(
            Object.entries(bySemantic).map(([semantic, fieldsForSemantic]) => [
                semantic,
                unique([...(DEFAULT_APIFY_INPUT_MAPPINGS[semantic] ?? []), ...fieldsForSemantic]),
            ]),
        ),
    };
}

export async function fetchApifyActorInputSchema(actorId, apiKey, fetchWithRetry = fetch) {
    const res = await fetchWithRetry(`https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/builds/default`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeApifyInputSchema(data.data?.inputSchema);
}
