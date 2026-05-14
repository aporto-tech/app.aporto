/**
 * @aporto-tech/sdk — Official SDK for the Aporto platform.
 *
 * Access 400+ LLM models, search, audio, images, SMS, and the Aporto skill
 * routing layer through a single API key. Generated media is stored in S3/R2
 * and returned as artifact URLs.
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
 *   console.log(audio.url);
 *
 *   // SMS verification
 *   await aporto.sms.send({ to: "+1234567890" });
 *
 *   // Skill routing — discover and execute any skill in the marketplace
 *   const { skills } = await aporto.routing.discoverSkills({ query: "generate image" });
 *   const result = await aporto.routing.executeSkill({ skillId: skills[0].id, params: { prompt: "a cat" } });
 *   console.log(result.result);
 */

import { createLlmModule } from "./modules/llm";
import { createSearchModule } from "./modules/search";
import { createAudioModule } from "./modules/audio";
import { createImagesModule } from "./modules/images";
import { createSmsModule } from "./modules/sms";
import { createRoutingModule } from "./modules/routing";
import { AportoConfigError } from "./errors";
import { DEFAULT_APP_BASE_URL, DEFAULT_LLM_BASE_URL } from "./modules/http";

export interface AportoClientOptions {
    apiKey: string;
    /** Optional agent name forwarded as X-Agent-Name header for observability */
    agentName?: string;
    /** API base URL for app-backed service routes. Defaults to https://app.aporto.tech */
    appBaseUrl?: string;
    /** OpenAI-compatible LLM base URL. Defaults to https://api.aporto.tech/v1 */
    llmBaseUrl?: string;
}

export class AportoClient {
    readonly llm: ReturnType<typeof createLlmModule>;
    readonly search: ReturnType<typeof createSearchModule>;
    readonly audio: ReturnType<typeof createAudioModule>;
    readonly images: ReturnType<typeof createImagesModule>;
    readonly sms: ReturnType<typeof createSmsModule>;
    readonly routing: ReturnType<typeof createRoutingModule>;

    constructor(options: AportoClientOptions) {
        if (!options.apiKey) {
            throw new AportoConfigError("apiKey is required");
        }

        const {
            apiKey,
            agentName,
            appBaseUrl = DEFAULT_APP_BASE_URL,
            llmBaseUrl = DEFAULT_LLM_BASE_URL,
        } = options;

        this.llm = createLlmModule(apiKey, agentName, llmBaseUrl);
        this.search = createSearchModule(apiKey, agentName, appBaseUrl);
        this.audio = createAudioModule(apiKey, agentName, appBaseUrl);
        this.images = createImagesModule(apiKey, agentName, appBaseUrl);
        this.sms = createSmsModule(apiKey, agentName, appBaseUrl);
        this.routing = createRoutingModule(apiKey, agentName, appBaseUrl);
    }
}

export { AportoError, AportoConfigError, AportoNotAvailableError } from "./errors";
export type { LinkupSearchOptions, YouSearchOptions, SearchResult } from "./modules/search";
export type { GenerateImageOptions, GenerateImageResult } from "./modules/images";
export type { TextToSpeechOptions, TextToSpeechResult } from "./modules/audio";
export type { SendSmsOptions, CheckSmsOptions, SmsResult } from "./modules/sms";
export { createX402Fetch, AportoPaymentError } from "./modules/x402";
export type { CreateX402FetchOptions } from "./modules/x402";
export type {
    DiscoverSkillsOptions,
    SkillResult,
    ExecuteSkillOptions,
    ExecuteSkillResult,
    SkillArtifact,
    RunSkillOptions,
    RunSkillResult,
    GetSkillRunOptions,
    WaitSkillRunOptions,
    SkillChoice,
} from "./modules/routing";
