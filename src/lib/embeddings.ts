/**
 * embedQuery — generate a 1536-dim embedding via the Aporto gateway.
 *
 * Uses NEWAPI_URL (defaults to https://api.aporto.tech) with a service-level
 * key (NEWAPI_ADMIN_KEY) — same gateway used for LLM completions in aporto_chat.
 * No direct OpenAI API key required.
 */
export async function embedQuery(text: string): Promise<number[]> {
    const baseUrl = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
    const apiKey = process.env.NEWAPI_ADMIN_KEY;
    if (!apiKey) {
        throw new Error("NEWAPI_ADMIN_KEY is not set — required for skill embedding generation");
    }

    const res = await fetch(`${baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Embeddings error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.data[0].embedding as number[];
}
