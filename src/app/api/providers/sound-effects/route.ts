/**
 * Provider: Sound Effects (ElevenLabs → R2)
 * Called by routing/execute with Authorization: Bearer {ELEVENLABS_API_KEY} (providerSecret).
 *
 * Returns JSON: { url, expires_at, char_count }
 * Audio is uploaded to R2 with a 24-hour lifecycle key.
 *
 * Params (from routing layer):
 *   text               string  — text/prompt describing the sound effect
 *   duration_seconds   number  — optional, 0.5–22
 *   prompt_influence   number  — 0–1, how closely to follow prompt (default: 0.3)
 *
 * Billing: costPerChar = $0.00024 / char
 */
import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
        const body = await req.json();
        const {
            text,
            duration_seconds,
            prompt_influence = 0.3,
        } = body;

        if (!text || typeof text !== "string") {
            return NextResponse.json({ success: false, message: "Missing required field: text" }, { status: 400 });
        }

        if (!apiKey) {
            return NextResponse.json({ success: false, message: "ElevenLabs API key not configured" }, { status: 503 });
        }

        const payload: Record<string, unknown> = { text, prompt_influence };
        if (duration_seconds != null) payload.duration_seconds = duration_seconds;

        const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json(
                { success: false, message: `ElevenLabs error: ${res.status}`, detail: errText },
                { status: res.status },
            );
        }

        const audioBuffer = await res.arrayBuffer();
        const key = `sfx/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.mp3`;
        const url = await uploadToR2(key, Buffer.from(audioBuffer), "audio/mpeg");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        return NextResponse.json({
            success: true,
            url,
            expires_at: expiresAt,
            char_count: text.length,
        });
    } catch (error) {
        console.error("[providers/sound-effects] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
