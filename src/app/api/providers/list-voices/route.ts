/**
 * Provider wrapper: List ElevenLabs Voices
 * Returns JSON list of available voices with their IDs, names, labels, and categories.
 * Free endpoint — no billing.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ success: false, message: "ElevenLabs API key not configured" }, { status: 503 });
        }

        const res = await fetch("https://api.elevenlabs.io/v1/voices", {
            headers: { "xi-api-key": apiKey },
        });

        if (!res.ok) {
            return NextResponse.json(
                { success: false, message: `ElevenLabs error: ${res.status}` },
                { status: res.status },
            );
        }

        const data = await res.json();
        const voices = (data.voices ?? []).map((v: Record<string, unknown>) => ({
            voice_id: v.voice_id,
            name: v.name,
            category: v.category,
            labels: v.labels,
            description: (v.description as string | null) ?? null,
            preview_url: v.preview_url,
        }));

        return NextResponse.json({ success: true, voices, count: voices.length });
    } catch (error) {
        console.error("[providers/list-voices] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
