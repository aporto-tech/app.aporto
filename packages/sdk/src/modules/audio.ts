import { DEFAULT_APP_BASE_URL, apiFetchJson, createJsonHeaders } from "./http";

export interface TextToSpeechOptions {
    text: string;
    voice_id?: string;
    model_id?: string;
    output_format?: string;
}

export interface TextToSpeechResult {
    success: boolean;
    url: string;
    storage_key: string;
    expires_at?: string;
    costUSD?: number;
    char_count: number;
    [key: string]: unknown;
}

export function createAudioModule(apiKey: string, agentName?: string, appBaseUrl = DEFAULT_APP_BASE_URL, integrationId?: string) {
    const headers = createJsonHeaders(apiKey, agentName, integrationId);

    return {
        /** Returns a stored audio artifact URL. */
        async speech(opts: TextToSpeechOptions): Promise<TextToSpeechResult> {
            return apiFetchJson<TextToSpeechResult>(
                appBaseUrl,
                "/api/services/tts",
                headers,
                {
                    text: opts.text,
                    voice_id: opts.voice_id ?? "21m00Tcm4TlvDq8ikWAM",
                    model_id: opts.model_id ?? "eleven_v3",
                    output_format: opts.output_format ?? "mp3_44100_128",
                },
                "TTS request",
            );
        },
    };
}
