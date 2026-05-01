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

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";

        if (!apiKey) {
            return NextResponse.json({ success: false, message: "Apify API key not configured" }, { status: 503 });
        }

        const body = await req.json() as Record<string, unknown>;
        const { actorId, ...actorInput } = body;

        if (!actorId || typeof actorId !== "string") {
            return NextResponse.json({ success: false, message: "Missing required field: actorId (set in provider syncConfig)" }, { status: 400 });
        }

        // Run actor synchronously — waits up to WAIT_SECS for completion
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
