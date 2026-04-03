import OpenAI from 'openai';

/**
 * LLM module — wraps the OpenAI SDK with api.aporto.tech as baseURL.
 * Provides access to 400+ models through a single Aporto API key.
 *
 * Usage:
 *   const aporto = new AportoClient({ apiKey: '...' })
 *   const chat = await aporto.llm.chat.completions.create({
 *     model: 'openai/gpt-4o-mini',
 *     messages: [{ role: 'user', content: 'Hello' }],
 *   })
 */
declare function createLlmModule(apiKey: string, agentName?: string): OpenAI;

interface LinkupSearchOptions {
    query: string;
    depth?: "standard" | "deep";
}
interface YouSearchOptions {
    query: string;
    type?: "search" | "research";
}
interface SearchResult {
    results?: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
    answer?: string;
    costUSD?: number;
    [key: string]: unknown;
}
declare function createSearchModule(apiKey: string, agentName?: string): {
    linkup(opts: LinkupSearchOptions): Promise<SearchResult>;
    you(opts: YouSearchOptions): Promise<SearchResult>;
};

interface TextToSpeechOptions {
    text: string;
    voice_id?: string;
    model_id?: string;
    output_format?: string;
}
declare function createAudioModule(apiKey: string, agentName?: string): {
    /** Returns raw audio bytes (mp3 by default) */
    speech(opts: TextToSpeechOptions): Promise<ArrayBuffer>;
};

interface GenerateImageOptions {
    prompt: string;
    model?: "flux-schnell" | "flux-dev" | "flux-pro";
    image_size?: "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9";
    num_images?: number;
}
interface GenerateImageResult {
    images: Array<{
        url: string;
        width: number;
        height: number;
    }>;
    costUSD: number;
    [key: string]: unknown;
}
declare function createImagesModule(apiKey: string, agentName?: string): {
    generate(opts: GenerateImageOptions): Promise<GenerateImageResult>;
};

interface SendSmsOptions {
    to: string;
}
interface CheckSmsOptions {
    to: string;
    code: string;
}
interface SmsResult {
    success: boolean;
    [key: string]: unknown;
}
declare function createSmsModule(apiKey: string, agentName?: string): {
    send(opts: SendSmsOptions): Promise<SmsResult>;
    check(opts: CheckSmsOptions): Promise<SmsResult>;
};

/**
 * @aporto/sdk — Error types
 */
declare class AportoError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
declare class AportoConfigError extends AportoError {
    constructor(message: string);
}
declare class AportoNotAvailableError extends AportoError {
    constructor(module: string);
}

/**
 * @aporto-tech/sdk — Official SDK for the Aporto platform.
 *
 * Access 400+ LLM models, search, audio, images, and SMS through a single API key.
 *
 * Usage:
 *   import { AportoClient } from "@aporto-tech/sdk";
 *
 *   const aporto = new AportoClient({ apiKey: process.env.APORTO_API_KEY });
 *
 *   // LLM — 400+ models
 *   const chat = await aporto.llm.chat.completions.create({
 *     model: "openai/gpt-4o-mini",
 *     messages: [{ role: "user", content: "Hello" }],
 *   });
 *
 *   // Web search
 *   const results = await aporto.search.linkup({ query: "AI news" });
 *
 *   // Image generation
 *   const img = await aporto.images.generate({ prompt: "a cat on the moon" });
 *
 *   // Text-to-speech
 *   const audio = await aporto.audio.speech({ text: "Hello from Aporto!" });
 *
 *   // SMS verification
 *   await aporto.sms.send({ to: "+1234567890" });
 */

interface AportoClientOptions {
    apiKey: string;
    /** Optional agent name forwarded as X-Agent-Name header for observability */
    agentName?: string;
}
declare class AportoClient {
    readonly llm: ReturnType<typeof createLlmModule>;
    readonly search: ReturnType<typeof createSearchModule>;
    readonly audio: ReturnType<typeof createAudioModule>;
    readonly images: ReturnType<typeof createImagesModule>;
    readonly sms: ReturnType<typeof createSmsModule>;
    constructor(options: AportoClientOptions);
}

export { AportoClient, type AportoClientOptions, AportoConfigError, AportoError, AportoNotAvailableError, type CheckSmsOptions, type GenerateImageOptions, type GenerateImageResult, type LinkupSearchOptions, type SearchResult, type SendSmsOptions, type SmsResult, type TextToSpeechOptions, type YouSearchOptions };
