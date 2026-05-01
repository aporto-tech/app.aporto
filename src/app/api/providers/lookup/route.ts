/**
 * Provider: Phone Lookup (Prelude)
 * Called by routing/execute with Authorization: Bearer {PRELUDE_API_KEY} (providerSecret).
 * Directly proxies to api.prelude.dev/v2/lookup.
 *
 * Params (from routing layer):
 *   phone_number  string  — E.164 phone number, e.g. +15551234567
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PRELUDE_BASE = "https://api.prelude.dev/v2";

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
        const body = await req.json() as { phone_number?: string };

        const { phone_number } = body;

        if (!phone_number) {
            return NextResponse.json({ success: false, message: "Missing required field: phone_number" }, { status: 400 });
        }

        const res = await fetch(`${PRELUDE_BASE}/lookup`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                phone_number,
            }),
            signal: AbortSignal.timeout(10_000),
        });

        const data = await res.json();

        if (!res.ok) {
            return NextResponse.json(
                { success: false, message: data.message ?? "Prelude error", detail: data },
                { status: res.status },
            );
        }

        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error("[providers/lookup] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
