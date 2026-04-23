/**
 * Provider wrapper: Text-to-Speech (ElevenLabs → R2)
 *
 * Called by the routing layer (routing/execute), which already deducted
 * the per-char cost before calling this endpoint.
 *
 * Returns JSON: { url, expires_at, char_count, model_id }
 * Audio is uploaded to R2 with a 24-hour lifecycle key.
 *
 * Per-char pricing (used by routing/execute pricePerCall override via params.model_id):
 *   eleven_flash_v2_5:       $0.08 / 1K chars
 *   eleven_turbo_v2_5:       $0.15 / 1K chars
 *   eleven_multilingual_v2:  $0.24 / 1K chars  (default)
 *   eleven_v3:               $0.30 / 1K chars
 */
import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel
const DEFAULT_MODEL = "eleven_multilingual_v2";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            text,
            voice_id = DEFAULT_VOICE_ID,
            model_id = DEFAULT_MODEL,
            output_format = "mp3_44100_128",
        } = body;

        if (!text || typeof text !== "string") {
            return NextResponse.json({ success: false, message: "Missing required field: text" }, { status: 400 });
        }

        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ success: false, message: "ElevenLabs API key not configured" }, { status: 503 });
        }

        const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voice_id}`, {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            body: JSON.stringify({
                text,
                model_id,
                output_format,
                voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json(
                { success: false, message: `ElevenLabs error: ${res.status}`, detail: errText },
                { status: res.status },
            );
        }

        const audioBuffer = await res.arrayBuffer();
        const audioBuf = Buffer.from(audioBuffer);

        // Try to upload to S3/R2; fall back to base64 if permissions aren't configured yet
        try {
            const key = `tts/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.mp3`;
            const url = await uploadToR2(key, audioBuf, "audio/mpeg");
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            return NextResponse.json({
                success: true,
                url,
                expires_at: expiresAt,
                char_count: text.length,
                model_id,
                voice_id,
            });
        } catch (uploadError) {
            console.warn("[providers/tts] S3 upload failed, returning base64 fallback:", String(uploadError));
            return NextResponse.json({
                success: true,
                url: null,
                audio_base64: audioBuf.toString("base64"),
                char_count: text.length,
                model_id,
                voice_id,
            });
        }
    } catch (error) {
        console.error("[providers/tts] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
