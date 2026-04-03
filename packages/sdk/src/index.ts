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

import { createLlmModule } from "./modules/llm";
import { createSearchModule } from "./modules/search";
import { createAudioModule } from "./modules/audio";
import { createImagesModule } from "./modules/images";
import { createSmsModule } from "./modules/sms";
import { AportoConfigError } from "./errors";

export interface AportoClientOptions {
    apiKey: string;
    /** Optional agent name forwarded as X-Agent-Name header for observability */
    agentName?: string;
}

export class AportoClient {
    readonly llm: ReturnType<typeof createLlmModule>;
    readonly search: ReturnType<typeof createSearchModule>;
    readonly audio: ReturnType<typeof createAudioModule>;
    readonly images: ReturnType<typeof createImagesModule>;
    readonly sms: ReturnType<typeof createSmsModule>;

    constructor(options: AportoClientOptions) {
        if (!options.apiKey) {
            throw new AportoConfigError("apiKey is required");
        }

        const { apiKey, agentName } = options;

        this.llm = createLlmModule(apiKey, agentName);
        this.search = createSearchModule(apiKey, agentName);
        this.audio = createAudioModule(apiKey, agentName);
        this.images = createImagesModule(apiKey, agentName);
        this.sms = createSmsModule(apiKey, agentName);
    }
}

export { AportoError, AportoConfigError, AportoNotAvailableError } from "./errors";
export type { LinkupSearchOptions, YouSearchOptions, SearchResult } from "./modules/search";
export type { GenerateImageOptions, GenerateImageResult } from "./modules/images";
export type { TextToSpeechOptions } from "./modules/audio";
export type { SendSmsOptions, CheckSmsOptions, SmsResult } from "./modules/sms";
