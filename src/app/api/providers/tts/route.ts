/**
 * Provider: Text-to-Speech (ElevenLabs → R2)
 * Called by routing/execute with Authorization: Bearer {ELEVENLABS_API_KEY} (providerSecret).
 *
 * Returns JSON: { url, expires_at, char_count, model_id }
 * Audio is uploaded to R2 using the shared artifact retention window.
 *
 * Params (from routing layer):
 *   text          string  — text to synthesize
 *   voice_id      string  — ElevenLabs voice ID (default: Rachel 21m00Tcm4TlvDq8ikWAM)
 *   model_id      string  — eleven_flash_v2_5 | eleven_turbo_v2_5 | eleven_multilingual_v2 | eleven_v3
 *   output_format string  — mp3_44100_128 (default)
 *
 * Per-char pricing by model (billed via costPerChar on Provider row):
 *   eleven_flash_v2_5:       $0.00008 / char  ($0.08 / 1K)
 *   eleven_turbo_v2_5:       $0.00015 / char  ($0.15 / 1K)
 *   eleven_multilingual_v2:  $0.00024 / char  ($0.24 / 1K)
 *   eleven_v3:               $0.00030 / char  ($0.30 / 1K)
 */
import { NextRequest, NextResponse } from "next/server";
import { artifactExpiresAt, uploadToR2 } from "@/lib/r2";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel
const DEFAULT_MODEL = "eleven_multilingual_v2";
const VOICE_IDS = new Set([
    DEFAULT_VOICE_ID,
    "EXAVITQu4vr4xnSDxMaL",
    "XB0fDUnXU5powFXDhCwa",
    "pNInz6obpgDQGcFmaJgB",
    "ErXwobaYiN019PkySvjV",
    "VR6AewLTigWG4xSOukaG",
    "N2lVS1w4EtoT3dr4eOWO",
    "IKne3meq5aSn9XLyUdCD",
    "onwK4e9ZLuTAKqWW03F9",
    "g5CIjZEefAph4nQFvHAz",
    "jsCqWAovK2LkecY7zXl4",
    "jBpfuIE2acCo8z3wKNLl",
    "oWAxZDx7w5VEj9dCyTzz",
    "SOYHLrjzK2X1ezoPC6cr",
    "bVMeCyTHy58xNoL34h3p",
    "XrExE9yKIg1WjnnlVkGX",
    "piTKgcLEGmPE4e6mEKli",
    "pFZP5JQG7iQjIQuC4Bku",
    "t0jbNlBVZ17f02VDIeMI",
    "ThT5KcBeYPX3keUQqHPh",
]);
const VOICE_NAME_TO_ID: Record<string, string> = {
    rachel: DEFAULT_VOICE_ID,
    bella: "EXAVITQu4vr4xnSDxMaL",
    charlotte: "XB0fDUnXU5powFXDhCwa",
    adam: "pNInz6obpgDQGcFmaJgB",
    antoni: "ErXwobaYiN019PkySvjV",
    arnold: "VR6AewLTigWG4xSOukaG",
    callum: "N2lVS1w4EtoT3dr4eOWO",
    charlie: "IKne3meq5aSn9XLyUdCD",
    daniel: "onwK4e9ZLuTAKqWW03F9",
    ethan: "g5CIjZEefAph4nQFvHAz",
    freya: "jsCqWAovK2LkecY7zXl4",
    gigi: "jBpfuIE2acCo8z3wKNLl",
    grace: "oWAxZDx7w5VEj9dCyTzz",
    harry: "SOYHLrjzK2X1ezoPC6cr",
    jeremy: "bVMeCyTHy58xNoL34h3p",
    matilda: "XrExE9yKIg1WjnnlVkGX",
    nicole: "piTKgcLEGmPE4e6mEKli",
    lily: "pFZP5JQG7iQjIQuC4Bku",
    george: "t0jbNlBVZ17f02VDIeMI",
    dorothy: "ThT5KcBeYPX3keUQqHPh",
};

function normalizeVoiceId(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) return DEFAULT_VOICE_ID;
    const trimmed = value.trim();
    const named = VOICE_NAME_TO_ID[trimmed.toLowerCase()];
    if (named) return named;
    return VOICE_IDS.has(trimmed) ? trimmed : DEFAULT_VOICE_ID;
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
        const body = await req.json();
        const {
            text,
            voice_id,
            model_id = DEFAULT_MODEL,
            output_format = "mp3_44100_128",
        } = body;
        const normalizedVoiceId = normalizeVoiceId(voice_id);

        if (!text || typeof text !== "string") {
            return NextResponse.json({ success: false, message: "Missing required field: text" }, { status: 400 });
        }

        if (!apiKey) {
            return NextResponse.json({ success: false, message: "ElevenLabs API key not configured" }, { status: 503 });
        }

        const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${normalizedVoiceId}`, {
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
        const key = `tts/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.mp3`;
        const expiresAt = artifactExpiresAt();
        const url = await uploadToR2(key, Buffer.from(audioBuffer), "audio/mpeg", { expiresAt });

        return NextResponse.json({
            success: true,
            url,
            storage_key: key,
            expires_at: expiresAt.toISOString(),
            char_count: text.length,
            model_id,
            voice_id: normalizedVoiceId,
        });
    } catch (error) {
        console.error("[providers/tts] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
