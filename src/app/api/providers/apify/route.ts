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

export const dynamic = "force-dynamic";

const APIFY_BASE = "https://api.apify.com/v2";
// Wait up to 90s for actor to finish synchronously.
// Actors that exceed this fall back to async polling (not yet implemented).
const WAIT_SECS = 90;

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
        data?: {
            id?: string;
            status?: string;
            defaultDatasetId?: string;
            exitCode?: number;
        };
        error?: { type?: string; message?: string };
    };

    return { runRes, runData };
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

function missingInputField(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const error = (data as { error?: { message?: string } }).error;
    const message = error?.message ?? "";
    const match = message.match(/Field input\.([A-Za-z0-9_]+) is required/i);
    return match?.[1] ?? null;
}

function retryInputForMissingField(
    field: string,
    input: Record<string, unknown>,
): Record<string, unknown> | null {
    if (input[field] !== undefined) return null;
    const query = queryWithLocation(input);
    const maxResults = firstNumber(
        input.maxResults,
        input.maxItems,
        input.limit,
        input.resultsLimit,
        input.maxCrawledPlaces,
    );

    if (/^(keyword|query|search|term|searchQuery|searchString)$/i.test(field) && query) {
        return { ...input, [field]: query };
    }
    if (/^(searchStringsArray|queries)$/i.test(field) && query) {
        return { ...input, [field]: [query] };
    }
    if (/^(maxItems|maxResults|limit|resultsLimit|maxCrawledPlaces)$/i.test(field) && maxResults != null) {
        return { ...input, [field]: maxResults };
    }
    if (/^(location|city|area)$/i.test(field)) {
        const location = firstString(input.location, input.city, input.area);
        if (location) return { ...input, [field]: location };
    }
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";

        if (!apiKey) {
            return NextResponse.json({ success: false, message: "Apify API key not configured" }, { status: 503 });
        }

        const body = await req.json() as Record<string, unknown>;
        const { actorId, ...rawActorInput } = body;

        if (!actorId || typeof actorId !== "string") {
            return NextResponse.json({ success: false, message: "Missing required field: actorId (set in provider syncConfig)" }, { status: 400 });
        }

        // Run actor synchronously — waits up to WAIT_SECS for completion
        const actorInput = rawActorInput;
        let { runRes, runData } = await startActor(actorId, actorInput, apiKey);
        const fallbackApiKey = process.env.APIFY_API_KEY;
        if (!runRes.ok && apifyAuthError(runData) && fallbackApiKey && fallbackApiKey !== apiKey) {
            console.warn("[providers/apify] providerSecret auth failed; retrying with APIFY_API_KEY env fallback");
            ({ runRes, runData } = await startActor(actorId, actorInput, fallbackApiKey));
        }
        const missingField = !runRes.ok ? missingInputField(runData) : null;
        const retryInput = missingField ? retryInputForMissingField(missingField, actorInput) : null;
        if (retryInput) {
            console.warn(`[providers/apify] retrying with inferred required field: ${missingField}`);
            ({ runRes, runData } = await startActor(actorId, retryInput, fallbackApiKey ?? apiKey));
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
        if (status === "FAILED" || status === "TIMED-OUT" || status === "ABORTED") {
            return NextResponse.json(
                { success: false, message: `Actor run ${status}`, runId: run?.id, status },
                { status: 502 },
            );
        }

        // Fetch dataset items (the actor's output)
        const datasetId = run?.defaultDatasetId;
        if (!datasetId) {
            return NextResponse.json({ success: false, message: "Actor completed but no dataset produced", runId: run?.id }, { status: 502 });
        }

        const datasetRes = await fetch(
            `${APIFY_BASE}/datasets/${datasetId}/items?clean=true&format=json`,
            {
                headers: { "Authorization": `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(30_000),
            },
        );

        if (!datasetRes.ok) {
            const errText = await datasetRes.text();
            return NextResponse.json(
                { success: false, message: `Failed to fetch results: ${datasetRes.status}`, detail: errText },
                { status: 502 },
            );
        }

        const items = await datasetRes.json() as unknown[];

        return NextResponse.json({
            success: true,
            items,
            itemCount: items.length,
            datasetId,
            runId: run?.id,
            status,
        });
    } catch (error) {
        console.error("[providers/apify] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
