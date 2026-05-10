import OpenAI from "openai";
import { DEFAULT_LLM_BASE_URL } from "./http";

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
export function createLlmModule(apiKey: string, agentName?: string, baseURL = DEFAULT_LLM_BASE_URL): OpenAI {
    const defaultHeaders: Record<string, string> = {};
    if (agentName) {
        defaultHeaders["X-Agent-Name"] = agentName;
    }

    return new OpenAI({
        apiKey,
        baseURL,
        defaultHeaders,
    });
}
