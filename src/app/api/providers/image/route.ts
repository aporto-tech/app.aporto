/**
 * Provider: Image Generation (fal.ai)
 * Called by routing/execute with Authorization: Bearer {FAL_API_KEY} (providerSecret).
 * Directly proxies to fal.run.
 *
 * Params (from routing layer):
 *   prompt      string   — image description
 *   model       string   — flux-schnell | flux-dev | flux-pro (default: flux-schnell)
 *   image_size  string   — square_hd | square | portrait_4_3 | portrait_16_9 | landscape_4_3 | landscape_16_9 (default: square_hd)
 *   num_images  number   — 1-4 (default: 1)
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FAL_BASE = "https://fal.run";

const MODEL_MAP: Record<string, string> = {
    "flux-schnell": "fal-ai/flux/schnell",
    "flux-dev":     "fal-ai/flux/dev",
    "flux-pro":     "fal-ai/flux-pro",
};

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
        const body = await req.json() as { prompt?: string; model?: string; image_size?: string; num_images?: number };

        const { prompt, model = "flux-schnell", image_size = "square_hd", num_images = 1 } = body;

        if (!prompt) {
            return NextResponse.json({ success: false, message: "Missing required field: prompt" }, { status: 400 });
        }

        const falModel = MODEL_MAP[model] ?? MODEL_MAP["flux-schnell"];

        const res = await fetch(`${FAL_BASE}/${falModel}`, {
            method: "POST",
            headers: {
                "Authorization": `Key ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt,
                image_size,
                num_images: Math.max(1, Math.min(4, Number(num_images))),
            }),
            signal: AbortSignal.timeout(60_000),
        });

        const data = await res.json();

        if (!res.ok) {
            return NextResponse.json(
                { success: false, message: data.message ?? "fal.ai error", detail: data },
                { status: res.status },
            );
        }

        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error("[providers/image] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
