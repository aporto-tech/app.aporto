import { AportoError } from "../errors";

export interface LinkupSearchOptions {
    query: string;
    depth?: "standard" | "deep";
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

export function createSearchModule(apiKey: string, agentName?: string) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };
    if (agentName) headers["X-Agent-Name"] = agentName;

    async function apiFetch(path: string, body: object): Promise<SearchResult> {
        const res = await fetch(`https://app.aporto.tech${path}`, {
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
            return apiFetch("/api/services/search", {
                query: opts.query,
                depth: opts.depth ?? "standard",
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
