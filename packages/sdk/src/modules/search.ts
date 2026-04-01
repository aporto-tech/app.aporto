import { AportoError } from "../errors";

export interface LinkupSearchOptions {
    query: string;
    depth?: "standard" | "deep";
    outputType?: "sourcedAnswer" | "searchResults";
}

export interface YouSearchOptions {
    query: string;
}

export interface SearchResult {
    results: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
    answer?: string;
}

/**
 * Search module — Linkup and You.com search via api.aporto.tech.
 *
 * Usage:
 *   const results = await aporto.search.linkup({ query: 'AI news', depth: 'standard' })
 *   const youResults = await aporto.search.you({ query: 'machine learning' })
 */
export function createSearchModule(apiKey: string, agentName?: string) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };
    if (agentName) {
        headers["X-Agent-Name"] = agentName;
    }

    async function apiFetch(path: string, body: object): Promise<SearchResult> {
        const res = await fetch(`https://api.aporto.tech${path}`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new AportoError(
                `Search request failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`,
                res.status
            );
        }

        return res.json() as Promise<SearchResult>;
    }

    return {
        linkup(opts: LinkupSearchOptions): Promise<SearchResult> {
            return apiFetch("/v1/search/linkup", {
                query: opts.query,
                depth: opts.depth ?? "standard",
                outputType: opts.outputType ?? "sourcedAnswer",
            });
        },

        you(opts: YouSearchOptions): Promise<SearchResult> {
            return apiFetch("/v1/search/you", { query: opts.query });
        },
    };
}
