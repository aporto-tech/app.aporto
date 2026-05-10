import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { validateApiKeyOrSession, deductUserQuota, logServiceUsage } from "@/lib/serviceProxy";
import { copyUrlToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

const FAL_BASE = "https://fal.run";

// Cost per megapixel by model (1MP = 1024x1024)
const MODEL_MAP: Record<string, { falModel: string; costPerMP: number }> = {
    "flux-schnell": { falModel: "fal-ai/flux/schnell", costPerMP: 0.004 },
    "flux-dev":     { falModel: "fal-ai/flux/dev",     costPerMP: 0.015 },
    "flux-pro":     { falModel: "fal-ai/flux-pro",      costPerMP: 0.04  },
};
const DEFAULT_MODEL = "flux-schnell";

// Approximate MP by image_size (standard presets)
const SIZE_TO_MP: Record<string, number> = {
    "square_hd":        1.05,  // 1024x1024
    "square":           0.25,  // 512x512
    "portrait_4_3":     0.75,  // 768x1024
    "portrait_16_9":    0.58,  // 576x1024
    "landscape_4_3":    0.75,  // 1024x768
    "landscape_16_9":   0.58,  // 1024x576
};
const DEFAULT_SIZE = "square_hd";

type FalImage = {
    url?: string;
    content_type?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
};

async function refundQuota(userId: number, costUSD: number) {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$executeRawUnsafe(
        `UPDATE users SET quota = quota + $1, used_quota = used_quota - $1 WHERE id = $2`,
        Math.ceil(costUSD * 500_000),
        userId,
    );
}

function extensionForContentType(contentType: string | undefined): string {
    if (contentType?.includes("png")) return "png";
    if (contentType?.includes("webp")) return "webp";
    if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
    return "png";
}

export async function POST(req: NextRequest) {
    try {
        const auth = await validateApiKeyOrSession(req);
        if (!auth) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const {
            prompt,
            model = DEFAULT_MODEL,
            image_size = DEFAULT_SIZE,
            num_images = 1,
        } = body;

        if (!prompt) {
            return NextResponse.json({ success: false, message: "Missing required field: prompt" }, { status: 400 });
        }

        const modelConfig = MODEL_MAP[model] ?? MODEL_MAP[DEFAULT_MODEL];
        const mp = SIZE_TO_MP[image_size] ?? 1.0;
        const costUSD = modelConfig.costPerMP * mp * Math.max(1, Math.min(4, Number(num_images)));

        // Check balance and deduct
        const balanceError = await deductUserQuota(auth.newApiUserId, costUSD);
        if (balanceError) return balanceError;

        const res = await fetch(`${FAL_BASE}/${modelConfig.falModel}`, {
            method: "POST",
            headers: {
                "Authorization": `Key ${process.env.FAL_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ prompt, image_size, num_images: Math.max(1, Math.min(4, Number(num_images))) }),
        });

        const data = await res.json();

        if (!res.ok) {
            await refundQuota(auth.newApiUserId, costUSD);
            return NextResponse.json(
                { success: false, message: data.message ?? "fal.ai error", detail: data },
                { status: res.status }
            );
        }

        let images: FalImage[];
        try {
            const generatedImages = Array.isArray(data.images) ? data.images as FalImage[] : [];
            const datePrefix = new Date().toISOString().slice(0, 10);
            images = await Promise.all(generatedImages.map(async (image, index) => {
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
        } catch (storageError) {
            await refundQuota(auth.newApiUserId, costUSD);
            return NextResponse.json(
                { success: false, message: "Generated images could not be stored in S3/R2", detail: String(storageError) },
                { status: 502 },
            );
        }

        await logServiceUsage(auth.newApiUserId, "image", "fal", costUSD, {
            model: modelConfig.falModel,
            image_size,
            num_images,
        });

        return NextResponse.json({ success: true, ...data, images, costUSD });
    } catch (error) {
        console.error("[services/image] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
