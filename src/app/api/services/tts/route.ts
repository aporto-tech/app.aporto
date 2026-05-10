import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { validateApiKeyOrSession, deductUserQuota, logServiceUsage } from "@/lib/serviceProxy";
import { artifactExpiresAt, uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

// Cost per 1,000 characters by model
const MODEL_COST: Record<string, number> = {
    eleven_flash_v2_5:    0.08,
    eleven_turbo_v2_5:    0.15,
    eleven_multilingual_v2: 0.24,
    eleven_v3:            0.30,
};
const DEFAULT_MODEL = "eleven_multilingual_v2";

async function refundQuota(userId: number, costUSD: number) {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$executeRawUnsafe(
        `UPDATE users SET quota = quota + $1, used_quota = used_quota - $1 WHERE id = $2`,
        Math.ceil(costUSD * 500_000),
        userId,
    );
}

/** Direct service endpoint — returns a stored audio URL. */
export async function POST(req: NextRequest) {
    try {
        const auth = await validateApiKeyOrSession(req);
        if (!auth) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

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

        const costPer1k = MODEL_COST[model_id] ?? MODEL_COST[DEFAULT_MODEL];
        const charCount = text.length;
        const costUSD = Math.max(0.0001, (charCount / 1000) * costPer1k);

        const balanceError = await deductUserQuota(auth.newApiUserId, costUSD);
        if (balanceError) return balanceError;

        const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voice_id}`, {
            method: "POST",
            headers: {
                "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
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
            await refundQuota(auth.newApiUserId, costUSD);
            return NextResponse.json(
                { success: false, message: `ElevenLabs error: ${res.status}`, detail: errText },
                { status: res.status },
            );
        }

        const audioBuffer = await res.arrayBuffer();
        let url: string;
        let storageKey: string;
        const expiresAt = artifactExpiresAt();
        try {
            storageKey = `tts/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.mp3`;
            url = await uploadToR2(storageKey, Buffer.from(audioBuffer), "audio/mpeg", { expiresAt });
        } catch (storageError) {
            await refundQuota(auth.newApiUserId, costUSD);
            return NextResponse.json(
                { success: false, message: "Generated audio could not be stored in S3/R2", detail: String(storageError) },
                { status: 502 },
            );
        }

        await logServiceUsage(auth.newApiUserId, "tts", "elevenlabs", costUSD, {
            charCount,
            voice_id,
            model_id,
        });

        return NextResponse.json({
            success: true,
            url,
            storage_key: storageKey,
            expires_at: expiresAt.toISOString(),
            costUSD,
            char_count: charCount,
        });
    } catch (error) {
        console.error("[services/tts] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
