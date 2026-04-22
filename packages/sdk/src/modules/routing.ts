import { AportoError } from "../errors";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoverSkillsOptions {
    query: string;
    /** Page number (0-indexed). Each page returns 5 results. */
    page?: number;
    /** Filter by category, e.g. "media/image", "search/web", "llm/chat" */
    category?: string;
    /** Filter by capability, e.g. "generate", "search", "transcribe" */
    capability?: string;
}

export interface SkillResult {
    id: number;
    name: string;
    description: string;
    category: string | null;
    capabilities: string[];
    inputTypes: string[];
    outputTypes: string[];
    paramsSchema: string | null;
    tags: string | null;
    similarity: number;
}

export interface ExecuteSkillOptions {
    /** Skill ID from discoverSkills */
    skillId: number;
    /** Parameters matching the skill's paramsSchema */
    params: Record<string, unknown>;
    /** Session ID for provider deduplication across retries */
    sessionId?: string;
}

export interface ExecuteSkillResult {
    success: boolean;
    data: unknown;
    skillId: number;
    providerId: number;
    providerName: string;
    latencyMs: number;
}

// ── Module ────────────────────────────────────────────────────────────────────

export function createRoutingModule(apiKey: string, agentName?: string) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };
    if (agentName) headers["X-Agent-Name"] = agentName;

    async function apiFetch<T>(path: string, body: object): Promise<T> {
        const res = await fetch(`https://app.aporto.tech${path}`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new AportoError(
                `Routing request failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`,
                res.status
            );
        }
        return res.json() as Promise<T>;
    }

    return {
        /**
         * Discover skills by semantic similarity.
         *
         * Uses pgvector cosine search to find skills matching your query.
         * Optionally filter by category or capability.
         *
         * @example
         * const { skills } = await aporto.routing.discoverSkills({
         *   query: "generate an image from a text prompt",
         *   category: "media/image",
         * });
         */
        async discoverSkills(opts: DiscoverSkillsOptions): Promise<{ skills: SkillResult[]; page: number }> {
            return apiFetch("/api/routing/skills", {
                query: opts.query,
                page: opts.page ?? 0,
                category: opts.category,
                capability: opts.capability,
            });
        },

        /**
         * Execute a skill by ID.
         *
         * Selects the best available provider (by price, latency, retry rate),
         * calls its endpoint with your params, and returns the result.
         *
         * Pass a consistent `sessionId` across retries — the router will
         * automatically avoid re-using a provider that already failed in the
         * same session.
         *
         * @example
         * const result = await aporto.routing.executeSkill({
         *   skillId: 3,
         *   params: { prompt: "a cat on the moon", model: "flux-schnell" },
         *   sessionId: "my-session-abc",
         * });
         */
        async executeSkill(opts: ExecuteSkillOptions): Promise<ExecuteSkillResult> {
            return apiFetch("/api/routing/execute", {
                skillId: opts.skillId,
                params: opts.params,
                sessionId: opts.sessionId,
            });
        },
    };
}
