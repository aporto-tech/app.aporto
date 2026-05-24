/**
 * Provider: Apify Actor Runner
 * Called by routing/execute with Authorization: Bearer {APIFY_API_KEY} (providerSecret).
 *
 * The routing layer merges provider.syncConfig into params before calling this endpoint.
 * syncConfig must contain:
 *   actorId  string  — Apify actor ID or "username~actor-name" slug
 *
 * All other params are forwarded as actor input (the actor's own paramsSchema).
 *
 * Returns JSON: { success: true, items: [...], itemCount: N, datasetId: "..." }
 *
 * Pricing: set pricePerCall on the Provider row to the actor's PPE rate.
 *   e.g. Google Maps Places Extractor charges $0.003/place-scraped.
 */
import { NextRequest, NextResponse } from "next/server";
import { applyProviderInputMappings } from "@/lib/inputMappings";

export const dynamic = "force-dynamic";

const APIFY_BASE = "https://api.apify.com/v2";
// Keep waitSecs=0 so the submit returns immediately with a runId (~1-2 s).
// Waiting for completion here causes timeouts in executeSkillViaProvider (10 s
// default). All Apify jobs are completed via SkillRun async polling instead.
const WAIT_SECS = 0;
const APIFY_FAILED_STATUSES = new Set(["FAILED", "TIMED-OUT", "ABORTED"]);
const PROVIDER_CONFIG_INPUT_KEYS = new Set([
    "actorId",
    "actorInputSchema",
    "classifier",
    "importedAt",
    "inputMappings",
    "pricing",
    "requestType",
    "responseCapBytes",
    "runId",
    "skippedReason",
    "source",
    "sourceUrl",
    "timeoutMs",
]);

type ApifyRunData = {
    id?: string;
    status?: string;
    defaultDatasetId?: string;
    exitCode?: number;
    statusMessage?: string;
    usageTotalUsd?: number;
    usageUsd?: unknown;
    chargedEventCounts?: Record<string, number>;
    pricingInfo?: unknown;
    stats?: unknown;
};

function runBillingFields(run?: ApifyRunData) {
    return {
        usageTotalUsd: run?.usageTotalUsd,
        usageUsd: run?.usageUsd,
        chargedEventCounts: run?.chargedEventCounts,
        pricingInfo: run?.pricingInfo,
        actorRun: run
            ? {
                id: run.id,
                status: run.status,
                defaultDatasetId: run.defaultDatasetId,
                usageTotalUsd: run.usageTotalUsd,
                usageUsd: run.usageUsd,
                chargedEventCounts: run.chargedEventCounts,
                pricingInfo: run.pricingInfo,
                stats: run.stats,
            }
            : undefined,
    };
}

function apifyAuthError(data: unknown): boolean {
    if (!data || typeof data !== "object") return false;
    const error = (data as { error?: { type?: string; message?: string } }).error;
    return error?.type === "user-or-token-not-found"
        || /token.*not valid|user was not found/i.test(error?.message ?? "");
}

async function startActor(actorId: string, actorInput: Record<string, unknown>, apiKey: string) {
    const runRes = await fetch(
        `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs?waitSecs=${WAIT_SECS}`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(actorInput),
            signal: AbortSignal.timeout((WAIT_SECS + 10) * 1_000),
        },
    );

    const runData = await runRes.json() as {
        data?: ApifyRunData;
        error?: { type?: string; message?: string };
    };

    return { runRes, runData };
}

async function fetchRun(runId: string, apiKey: string) {
    const runRes = await fetch(`${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
    });
    const runData = await runRes.json() as {
        data?: ApifyRunData;
        error?: { type?: string; message?: string };
    };
    return { runRes, runData };
}

async function fetchDatasetItems(datasetId: string, apiKey: string) {
    const datasetRes = await fetch(
        `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,
        {
            headers: { "Authorization": `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(30_000),
        },
    );

    if (!datasetRes.ok) {
        const errText = await datasetRes.text();
        return {
            ok: false as const,
            response: NextResponse.json(
                { success: false, message: `Failed to fetch results: ${datasetRes.status}`, detail: errText },
                { status: 502 },
            ),
        };
    }

    return { ok: true as const, items: await datasetRes.json() as unknown[] };
}

function firstString(...values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
}

function firstNumber(...values: unknown[]): number | null {
    for (const value of values) {
        const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
        if (Number.isFinite(number) && number > 0) return Math.floor(number);
    }
    return null;
}

function queryWithLocation(input: Record<string, unknown>): string | null {
    const query = firstString(
        input.searchQuery,
        input.query,
        input.keyword,
        input.search,
        input.term,
        input.prompt,
    );
    const location = firstString(input.location, input.city, input.area);
    return query && location && !query.toLowerCase().includes(location.toLowerCase())
        ? `${query} in ${location}`
        : query;
}

function hasNonEmptyValue(value: unknown): boolean {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value != null;
}

function stripProviderConfigFields(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(input).filter(([key]) => !PROVIDER_CONFIG_INPUT_KEYS.has(key)),
    );
}

function normalizeActorInput(actorId: string, input: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...input };
    const actorText = actorId.toLowerCase();
    const query = queryWithLocation(normalized);
    const maxResults = firstNumber(
        normalized.maxResults,
        normalized.maxItems,
        normalized.limit,
        normalized.resultsLimit,
        normalized.maxCrawledPlaces,
        normalized.maxCrawledPlacesPerSearch,
        normalized.maxPlacesPerSearch,
        normalized.maxTotalPlaces,
        normalized.totalMaxPlaces,
    );

    if (
        actorText.includes("google-maps")
        && query
        && !hasNonEmptyValue(normalized.searchStringsArray)
        && !hasNonEmptyValue(normalized.placeIds)
    ) {
        normalized.searchStringsArray = [query];
    }

    if (actorText.includes("google-maps") && maxResults != null) {
        for (const field of [
            "maxResults",
            "maxItems",
            "limit",
            "resultsLimit",
            "maxCrawledPlaces",
            "maxCrawledPlacesPerSearch",
            "maxPlacesPerSearch",
            "maxTotalPlaces",
            "totalMaxPlaces",
        ]) {
            if (normalized[field] === undefined) normalized[field] = maxResults;
        }
    }

    return normalized;
}

function missingInputField(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const error = (data as { error?: { message?: string } }).error;
    const message = error?.message ?? "";
    const match = message.match(/Field input\.([A-Za-z0-9_]+) is required/i);
    return match?.[1] ?? null;
}

function invalidTypeField(data: unknown): { field: string; type: "string" | "number" | "boolean" | "array" } | null {
    if (!data || typeof data !== "object") return null;
    const error = (data as { error?: { message?: string } }).error;
    const message = error?.message ?? "";
    const match = message.match(/Field input\.([A-Za-z0-9_]+) must be (string|number|boolean|array)/i);
    if (!match) return null;
    return { field: match[1], type: match[2].toLowerCase() as "string" | "number" | "boolean" | "array" };
}

function valueForField(field: string, input: Record<string, unknown>): unknown {
    const query = queryWithLocation(input);
    const maxResults = firstNumber(
        input.maxResults,
        input.maxItems,
        input.limit,
        input.resultsLimit,
        input.maxCrawledPlaces,
        input.maxCrawledPlacesPerSearch,
        input.maxPlacesPerSearch,
        input.maxTotalPlaces,
        input.totalMaxPlaces,
    );

    if (/^(keyword|query|search|term|searchQuery|searchString)$/i.test(field) && query) {
        return query;
    }
    if (/^(searchStringsArray|queries)$/i.test(field) && query) {
        return [query];
    }
    if (/^(maxItems|maxResults|limit|resultsLimit|maxCrawledPlaces|maxCrawledPlacesPerSearch|maxPlacesPerSearch|maxTotalPlaces|totalMaxPlaces)$/i.test(field) && maxResults != null) {
        return maxResults;
    }
    if (/^(location|city|area)$/i.test(field)) {
        const location = firstString(input.location, input.city, input.area);
        if (location) return location;
    }
    return undefined;
}

function retryInputForMissingField(field: string, input: Record<string, unknown>): Record<string, unknown> | null {
    if (input[field] !== undefined) return null;
    const value = valueForField(field, input);
    return value === undefined ? null : { ...input, [field]: value };
}

function retryInputForTypeError(
    issue: { field: string; type: "string" | "number" | "boolean" | "array" },
    input: Record<string, unknown>,
): Record<string, unknown> | null {
    const current = input[issue.field] ?? valueForField(issue.field, input);
    if (current === undefined) return null;

    if (issue.type === "string") return { ...input, [issue.field]: Array.isArray(current) ? current.join("\n") : String(current) };
    if (issue.type === "number") {
        const number = Number(current);
        return Number.isFinite(number) ? { ...input, [issue.field]: number } : null;
    }
    if (issue.type === "boolean") {
        if (typeof current === "boolean") return null;
        if (typeof current === "string") return { ...input, [issue.field]: /^(true|1|yes)$/i.test(current) };
        return { ...input, [issue.field]: Boolean(current) };
    }
    if (issue.type === "array") return { ...input, [issue.field]: Array.isArray(current) ? current : [current] };
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";

        if (!apiKey) {
            return NextResponse.json({ success: false, message: "Apify API key not configured" }, { status: 503 });
        }

        const body = await req.json() as Record<string, unknown>;
        const fallbackApiKey = process.env.APIFY_API_KEY;
        let effectiveApiKey = apiKey;

        if (body.requestType === "apify.getRunResult") {
            const runId = typeof body.runId === "string" ? body.runId : "";
            if (!runId) {
                return NextResponse.json({ success: false, message: "Missing required field: runId" }, { status: 400 });
            }

            let { runRes, runData } = await fetchRun(runId, effectiveApiKey);
            if (!runRes.ok && apifyAuthError(runData) && fallbackApiKey && fallbackApiKey !== effectiveApiKey) {
                effectiveApiKey = fallbackApiKey;
                ({ runRes, runData } = await fetchRun(runId, effectiveApiKey));
            }

            if (!runRes.ok || runData.error) {
                return NextResponse.json(
                    {
                        success: false,
                        message: runData.error?.message ?? `Apify error ${runRes.status}`,
                        detail: runData,
                    },
                    { status: runRes.status },
                );
            }

            const run = runData.data;
            const status = run?.status;
            if (status && APIFY_FAILED_STATUSES.has(status)) {
                return NextResponse.json({
                    success: true,
                    runId: run?.id ?? runId,
                    status,
                    datasetId: run?.defaultDatasetId,
                    exitCode: run?.exitCode,
                    message: run?.statusMessage ?? `Actor run ${status}`,
                    ...runBillingFields(run),
                });
            }
            if (status !== "SUCCEEDED") {
                return NextResponse.json({
                    success: true,
                    runId: run?.id ?? runId,
                    status,
                    datasetId: run?.defaultDatasetId,
                    ...runBillingFields(run),
                });
            }

            const datasetId = run?.defaultDatasetId;
            if (!datasetId) {
                return NextResponse.json({ success: false, message: "Actor completed but no dataset produced", runId: run?.id }, { status: 502 });
            }

            const dataset = await fetchDatasetItems(datasetId, effectiveApiKey);
            if (!dataset.ok) return dataset.response;

            return NextResponse.json({
                success: true,
                items: dataset.items,
                itemCount: dataset.items.length,
                datasetId,
                runId: run?.id,
                status,
                ...runBillingFields(run),
            });
        }

        const { actorId, ...rawActorInput } = body;

        if (!actorId || typeof actorId !== "string") {
            return NextResponse.json({ success: false, message: "Missing required field: actorId (set in provider syncConfig)" }, { status: 400 });
        }

        // Run actor synchronously — waits up to WAIT_SECS for completion
        let actorInput = normalizeActorInput(
            actorId,
            applyProviderInputMappings(stripProviderConfigFields(rawActorInput), body),
        );
        let { runRes, runData } = await startActor(actorId, actorInput, apiKey);
        if (!runRes.ok && apifyAuthError(runData) && fallbackApiKey && fallbackApiKey !== apiKey) {
            console.warn("[providers/apify] providerSecret auth failed; retrying with APIFY_API_KEY env fallback");
            effectiveApiKey = fallbackApiKey;
            ({ runRes, runData } = await startActor(actorId, actorInput, fallbackApiKey));
        }

        for (let attempt = 0; attempt < 3 && !runRes.ok; attempt += 1) {
            const missingField = missingInputField(runData);
            const typeIssue = invalidTypeField(runData);
            const retryInput = missingField
                ? retryInputForMissingField(missingField, actorInput)
                : typeIssue
                    ? retryInputForTypeError(typeIssue, actorInput)
                    : null;
            if (!retryInput) break;
            actorInput = retryInput;
            console.warn(`[providers/apify] retrying with adjusted input for ${missingField ?? typeIssue?.field}`);
            ({ runRes, runData } = await startActor(actorId, actorInput, effectiveApiKey));
        }

        if (!runRes.ok || runData.error) {
            return NextResponse.json(
                {
                    success: false,
                    message: runData.error?.message ?? `Apify error ${runRes.status}`,
                    detail: runData,
                },
                { status: runRes.status },
            );
        }

        const run = runData.data;
        const status = run?.status;

        // FAILED or TIMED-OUT — return error with status
        if (status && APIFY_FAILED_STATUSES.has(status)) {
            return NextResponse.json(
                {
                    success: false,
                    message: run?.statusMessage ?? `Actor run ${status}`,
                    runId: run?.id,
                    status,
                    ...runBillingFields(run),
                },
                { status: 502 },
            );
        }

        // Fetch dataset items (the actor's output)
        const datasetId = run?.defaultDatasetId;
        if (!datasetId) {
            return NextResponse.json({ success: false, message: "Actor completed but no dataset produced", runId: run?.id }, { status: 502 });
        }

        if (status !== "SUCCEEDED") {
            return NextResponse.json({
                success: true,
                runId: run?.id,
                status,
                datasetId,
                ...runBillingFields(run),
            });
        }

        const dataset = await fetchDatasetItems(datasetId, effectiveApiKey);
        if (!dataset.ok) return dataset.response;

        return NextResponse.json({
            success: true,
            items: dataset.items,
            itemCount: dataset.items.length,
            datasetId,
            runId: run?.id,
            status,
            ...runBillingFields(run),
        });
    } catch (error) {
        console.error("[providers/apify] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
