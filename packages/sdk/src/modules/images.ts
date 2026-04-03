import { AportoError } from "../errors";

export interface GenerateImageOptions {
    prompt: string;
    model?: "flux-schnell" | "flux-dev" | "flux-pro";
    image_size?: "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9";
    num_images?: number;
}

export interface GenerateImageResult {
    images: Array<{ url: string; width: number; height: number }>;
    costUSD: number;
    [key: string]: unknown;
}

export function createImagesModule(apiKey: string, agentName?: string) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };
    if (agentName) headers["X-Agent-Name"] = agentName;

    return {
        async generate(opts: GenerateImageOptions): Promise<GenerateImageResult> {
            const res = await fetch("https://app.aporto.tech/api/services/image", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    prompt: opts.prompt,
                    model: opts.model ?? "flux-schnell",
                    image_size: opts.image_size ?? "square_hd",
                    num_images: opts.num_images ?? 1,
                }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new AportoError(`Image generation failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`, res.status);
            }
            return res.json() as Promise<GenerateImageResult>;
        },
    };
}
