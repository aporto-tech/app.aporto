import { DEFAULT_APP_BASE_URL, apiFetchJson, createJsonHeaders } from "./http";

export interface GenerateImageOptions {
    prompt: string;
    model?: "flux-schnell" | "flux-dev" | "flux-pro";
    image_size?: "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9";
    num_images?: number;
}

export interface GenerateImageResult {
    images: Array<{
        url: string;
        storage_key: string;
        width?: number;
        height?: number;
        content_type?: string;
        [key: string]: unknown;
    }>;
    costUSD: number;
    [key: string]: unknown;
}

export function createImagesModule(apiKey: string, agentName?: string, appBaseUrl = DEFAULT_APP_BASE_URL, integrationId?: string) {
    const headers = createJsonHeaders(apiKey, agentName, integrationId);

    return {
        async generate(opts: GenerateImageOptions): Promise<GenerateImageResult> {
            return apiFetchJson<GenerateImageResult>(
                appBaseUrl,
                "/api/services/image",
                headers,
                {
                    prompt: opts.prompt,
                    model: opts.model ?? "flux-schnell",
                    image_size: opts.image_size ?? "square_hd",
                    num_images: opts.num_images ?? 1,
                },
                "Image generation",
            );
        },
    };
}
