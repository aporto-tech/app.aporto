/**
 * Provider: AI Search / Research (You.com)
 * Called by routing/execute with Authorization: Bearer {YOUCOM_API_KEY} (providerSecret).
 * Directly proxies to api.you.com.
 *
 * Params (from routing layer):
 *   query            string                    — search/research query
 *   type             "search" | "research"     — search=$0.005, research=$0.0065
 *   research_effort  "lite"|"standard"|"deep"  — only for research mode
 *
 * You.com endpoints:
 *   Search:   GET  https://api.you.com/v1/search?query=...
 *   Research: POST https://api.you.com/v1/research  { input, research_effort }
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const YOUCOM_BASE = "https://api.you.com";

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
        const body = await req.json() as { query?: string; type?: string; research_effort?: string };

        const { query, type = "search", research_effort = "standard" } = body;

        if (!query) {
            return NextResponse.json({ success: false, message: "Missing required field: query" }, { status: 400 });
        }

        let res: Response;

        if (type === "research") {
            res = await fetch(`${YOUCOM_BASE}/v1/research`, {
                method: "POST",
                headers: {
                    "X-API-Key": apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ input: query, research_effort }),
                signal: AbortSignal.timeout(60_000),
            });
        } else {
            const url = new URL(`${YOUCOM_BASE}/v1/search`);
            url.searchParams.set("query", query);
            res = await fetch(url.toString(), {
                method: "GET",
                headers: { "X-API-Key": apiKey },
                signal: AbortSignal.timeout(15_000),
            });
        }

        const data = await res.json();

        if (!res.ok) {
            return NextResponse.json(
                { success: false, message: data.message ?? "You.com error", detail: data },
                { status: res.status },
            );
        }

        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error("[providers/ai-search] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
