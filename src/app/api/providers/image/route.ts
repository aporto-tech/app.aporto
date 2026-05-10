/**
 * Provider: Image Generation (fal.ai → S3/R2)
 * Called by routing/execute with Authorization: Bearer {FAL_API_KEY} (providerSecret).
 * Generates with fal.run, copies every image to S3/R2, and returns only bucket URLs.
 *
 * Params (from routing layer):
 *   prompt      string   — image description
 *   model       string   — flux-schnell | flux-dev | flux-pro (default: flux-schnell)
 *   image_size  string   — square_hd | square | portrait_4_3 | portrait_16_9 | landscape_4_3 | landscape_16_9 (default: square_hd)
 *   num_images  number   — 1-4 (default: 1)
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { copyUrlToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

const FAL_BASE = "https://fal.run";

const MODEL_MAP: Record<string, string> = {
    "flux-schnell": "fal-ai/flux/schnell",
    "flux-dev":     "fal-ai/flux/dev",
    "flux-pro":     "fal-ai/flux-pro",
};

type FalImage = {
    url?: string;
    content_type?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
};

function extensionForContentType(contentType: string | undefined): string {
    if (contentType?.includes("png")) return "png";
    if (contentType?.includes("webp")) return "webp";
    if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
    return "png";
}

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

        const generatedImages = Array.isArray(data.images) ? data.images as FalImage[] : [];
        const datePrefix = new Date().toISOString().slice(0, 10);

        const images = await Promise.all(generatedImages.map(async (image, index) => {
            if (!image.url) {
                throw new Error(`fal.ai returned image ${index + 1} without url`);
            }

            const contentType = image.content_type ?? "image/png";
            const ext = extensionForContentType(contentType);
            const key = `images/${datePrefix}/${randomUUID()}.${ext}`;
            const url = await copyUrlToR2(image.url, key, contentType);

            return {
                ...image,
                url,
                storage_key: key,
            };
        }));

        return NextResponse.json({ success: true, ...data, images });
    } catch (error) {
        console.error("[providers/image] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
