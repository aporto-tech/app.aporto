/**
 * @aporto/sdk — Official SDK for the Aporto platform.
 *
 * Access 400+ LLM models, search, audio, images, browser, compute,
 * messaging, database, and SMS through a single API key.
 *
 * Usage:
 *   import { AportoClient } from "@aporto/sdk";
 *
 *   const aporto = new AportoClient({ apiKey: process.env.APORTO_API_KEY });
 *
 *   // LLM — powered by OpenAI-compatible API
 *   const chat = await aporto.llm.chat.completions.create({
 *     model: "openai/gpt-4o-mini",
 *     messages: [{ role: "user", content: "Hello" }],
 *   });
 *
 *   // Search
 *   const results = await aporto.search.linkup({ query: "AI news" });
 */

import { createLlmModule } from "./modules/llm";
import { createSearchModule } from "./modules/search";
import { createAudioModule } from "./modules/audio";
import { createImagesModule } from "./modules/images";
import { createBrowserModule } from "./modules/browser";
import { createComputeModule } from "./modules/compute";
import { createMessagingModule } from "./modules/messaging";
import { createDbModule } from "./modules/db";
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
    readonly browser: ReturnType<typeof createBrowserModule>;
    readonly compute: ReturnType<typeof createComputeModule>;
    readonly messaging: ReturnType<typeof createMessagingModule>;
    readonly db: ReturnType<typeof createDbModule>;
    readonly sms: ReturnType<typeof createSmsModule>;

    constructor(options: AportoClientOptions) {
        if (!options.apiKey) {
            throw new AportoConfigError("apiKey is required");
        }

        const { apiKey, agentName } = options;

        this.llm = createLlmModule(apiKey, agentName);
        this.search = createSearchModule(apiKey, agentName);
        this.audio = createAudioModule();
        this.images = createImagesModule();
        this.browser = createBrowserModule();
        this.compute = createComputeModule();
        this.messaging = createMessagingModule();
        this.db = createDbModule();
        this.sms = createSmsModule();
    }
}

export { AportoError, AportoConfigError, AportoNotAvailableError } from "./errors";
export type { LinkupSearchOptions, YouSearchOptions, SearchResult } from "./modules/search";
