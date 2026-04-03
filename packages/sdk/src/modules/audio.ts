import { AportoError } from "../errors";

export interface TextToSpeechOptions {
    text: string;
    voice_id?: string;
    model_id?: string;
    output_format?: string;
}

export function createAudioModule(apiKey: string, agentName?: string) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };
    if (agentName) headers["X-Agent-Name"] = agentName;

    return {
        /** Returns raw audio bytes (mp3 by default) */
        async speech(opts: TextToSpeechOptions): Promise<ArrayBuffer> {
            const res = await fetch("https://app.aporto.tech/api/services/tts", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    text: opts.text,
                    voice_id: opts.voice_id ?? "21m00Tcm4TlvDq8ikWAM",
                    model_id: opts.model_id ?? "eleven_v3",
                    output_format: opts.output_format ?? "mp3_44100_128",
                }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new AportoError(`TTS request failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`, res.status);
            }
            return res.arrayBuffer();
        },
    };
}
