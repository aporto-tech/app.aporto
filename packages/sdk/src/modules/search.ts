import { DEFAULT_APP_BASE_URL, apiFetchJson, createJsonHeaders } from "./http";

export interface LinkupSearchOptions {
    query: string;
    depth?: "standard" | "deep";
    outputType?: "sourcedAnswer" | "searchResults";
}

export interface YouSearchOptions {
    query: string;
    type?: "search" | "research";
}

export interface SearchResult {
    results?: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
    answer?: string;
    costUSD?: number;
    [key: string]: unknown;
}

export function createSearchModule(apiKey: string, agentName?: string, appBaseUrl = DEFAULT_APP_BASE_URL) {
    const headers = createJsonHeaders(apiKey, agentName);

    async function apiFetch(path: string, body: object): Promise<SearchResult> {
        return apiFetchJson<SearchResult>(appBaseUrl, path, headers, body, "Search request");
    }

    return {
        linkup(opts: LinkupSearchOptions): Promise<SearchResult> {
            return apiFetch("/api/services/search", {
                query: opts.query,
                depth: opts.depth ?? "standard",
                outputType: opts.outputType ?? "sourcedAnswer",
            });
        },

        you(opts: YouSearchOptions): Promise<SearchResult> {
            return apiFetch("/api/services/ai-search", {
                query: opts.query,
                type: opts.type ?? "search",
            });
        },
    };
}
