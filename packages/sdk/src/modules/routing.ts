import { DEFAULT_APP_BASE_URL, apiFetchJson, apiGetJson, createJsonHeaders } from "./http";

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
    /** Minimum price (USD) per call from active providers */
    priceUSD: number | null;
    /** True when this skill can be run through the anonymous CLI trial. */
    trialAvailable?: boolean;
}

export interface ExecuteSkillOptions {
    /** Skill ID from discoverSkills */
    skillId: number;
    /** Parameters matching the skill's paramsSchema */
    params: Record<string, unknown>;
    /** Session ID for provider deduplication across retries */
    sessionId?: string;
}

export interface SkillArtifact {
    type: string;
    url: string;
    storage_key?: string;
    expires_at?: string;
    content_type?: string;
}

export interface ExecuteSkillResult {
    success: true;
    provider: string;
    latencyMs: number;
    costUSD: number;
    errorType: "success";
    attempts: number;
    artifact: SkillArtifact;
    artifacts: SkillArtifact[];
    result: unknown;
}

export interface RunSkillOptions {
    /** Plain-language task intent, e.g. "generate image with nano banana" */
    intent: string;
    /** Parameters matching the skill paramsSchema */
    params?: Record<string, unknown>;
    /** Exact skill ID from discoverSkills. If omitted, Aporto discovers from intent. */
    skillId?: number;
    /** Optional provider/model hint, e.g. "kie", "runway", "veo 3.1 lite" */
    providerHint?: string;
    /** Wait for async providers within maxWaitSeconds. Defaults to true. */
    waitForResult?: boolean;
    /** Max inline wait in seconds. Backend clamps to its max. */
    maxWaitSeconds?: number;
    /** Caller-controlled session ID for retry routing and idempotent grouping. */
    sessionId?: string;
}

export interface GetSkillRunOptions {
    runId: string;
    waitForResult?: boolean;
    maxWaitSeconds?: number;
}

export interface WaitSkillRunOptions {
    runId: string;
    /** Total client-side wait budget in seconds. Defaults to 600. */
    timeoutSeconds?: number;
    /** Poll interval in seconds. Defaults to 30. */
    pollIntervalSeconds?: number;
    /** Per-request server-side wait in seconds. Defaults to 30. */
    maxWaitSeconds?: number;
}

export interface SkillChoice {
    skillId?: number;
    id?: number;
    name: string;
    description?: string;
    category?: string | null;
    capabilities?: string[];
    inputTypes?: string[];
    outputTypes?: string[];
    paramsSchema?: unknown;
    tags?: unknown;
    similarity?: number;
}

export interface RunSkillResult {
    success?: boolean;
    status: "needs_selection" | "running" | "waiting" | "succeeded" | "failed" | string;
    runId: string;
    skillId: number;
    skillName?: string;
    providerId?: number;
    provider?: string;
    providerTaskId?: string;
    nextPollAt?: string;
    costUSD?: number;
    data?: unknown;
    artifact?: SkillArtifact;
    artifacts?: SkillArtifact[];
    choices?: SkillChoice[];
    error?: {
        code?: string;
        message?: string;
        cause?: string;
        retryable?: boolean;
    };
    message?: string;
    trial?: boolean;
    trialMessage?: string;
}

// ── Module ────────────────────────────────────────────────────────────────────

export function createRoutingModule(apiKey: string, agentName?: string, appBaseUrl = DEFAULT_APP_BASE_URL, integrationId?: string) {
    const headers = createJsonHeaders(apiKey, agentName, integrationId);

    async function apiFetch<T>(path: string, body: object): Promise<T> {
        return apiFetchJson<T>(appBaseUrl, path, headers, body, "Routing request");
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
         * console.log(result.result);
         */
        async executeSkill(opts: ExecuteSkillOptions): Promise<ExecuteSkillResult> {
            return apiFetch("/api/routing/execute", {
                skillId: opts.skillId,
                params: opts.params,
                sessionId: opts.sessionId,
            });
        },

        /**
         * Discover, route, execute, store artifacts, and optionally wait for a skill result.
         *
         * This mirrors the high-level MCP tool `aporto_run_skill`.
         */
        async runSkill(opts: RunSkillOptions): Promise<RunSkillResult> {
            return apiFetch("/api/routing/run", {
                intent: opts.intent,
                params: opts.params ?? {},
                skillId: opts.skillId,
                providerHint: opts.providerHint,
                waitForResult: opts.waitForResult ?? true,
                maxWaitSeconds: opts.maxWaitSeconds,
                sessionId: opts.sessionId,
            });
        },

        /**
         * Fetch or continue polling a skill run by ID.
         */
        async getSkillRun(opts: GetSkillRunOptions): Promise<RunSkillResult> {
            const params = new URLSearchParams();
            if (opts.waitForResult !== undefined) params.set("waitForResult", String(opts.waitForResult));
            if (opts.maxWaitSeconds !== undefined) params.set("maxWaitSeconds", String(opts.maxWaitSeconds));
            const query = params.toString();
            return apiGetJson<RunSkillResult>(
                appBaseUrl,
                `/api/routing/runs/${encodeURIComponent(opts.runId)}${query ? `?${query}` : ""}`,
                headers,
                "Routing run status request",
            );
        },

        /**
         * Poll until a skill run reaches a terminal state or the client-side timeout expires.
         */
        async waitSkillRun(opts: WaitSkillRunOptions): Promise<RunSkillResult> {
            const timeoutMs = Math.max(1, opts.timeoutSeconds ?? 600) * 1000;
            const pollIntervalMs = Math.max(1, opts.pollIntervalSeconds ?? 30) * 1000;
            const startedAt = Date.now();
            let last: RunSkillResult | null = null;

            while (Date.now() - startedAt <= timeoutMs) {
                last = await this.getSkillRun({
                    runId: opts.runId,
                    waitForResult: true,
                    maxWaitSeconds: opts.maxWaitSeconds ?? 600,
                });

                if (last.status === "succeeded" || last.status === "failed" || last.status === "needs_selection") {
                    return last;
                }

                const remainingMs = timeoutMs - (Date.now() - startedAt);
                if (remainingMs <= 0) break;
                await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
            }

            return last ?? {
                status: "failed",
                runId: opts.runId,
                skillId: 0,
                error: {
                    code: "WAIT_TIMEOUT",
                    message: "Timed out waiting for skill run.",
                    retryable: true,
                },
            };
        },
    };
}
