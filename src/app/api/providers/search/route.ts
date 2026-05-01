/**
 * Provider: Web Search (Linkup)
 * Called by routing/execute with Authorization: Bearer {LINKUP_API_KEY} (providerSecret).
 * Directly proxies to api.linkup.so/v1/search.
 *
 * Params (from routing layer):
 *   query       string   — search query
 *   depth       "standard" | "deep"   — standard=$0.006, deep=$0.05 (EUR)
 *   outputType  "sourcedAnswer" | "searchResults"
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LINKUP_BASE = "https://api.linkup.so/v1";

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
        const body = await req.json() as { query?: string; depth?: string; outputType?: string };

        const { query, depth = "standard", outputType = "sourcedAnswer" } = body;

        if (!query) {
            return NextResponse.json({ success: false, message: "Missing required field: query" }, { status: 400 });
        }

        const res = await fetch(`${LINKUP_BASE}/search`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ q: query, depth, outputType }),
            signal: AbortSignal.timeout(15_000),
        });

        const data = await res.json();

        if (!res.ok) {
            return NextResponse.json(
                { success: false, message: data.message ?? "Linkup error", detail: data },
                { status: res.status },
            );
        }

        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error("[providers/search] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
