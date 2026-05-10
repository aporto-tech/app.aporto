import { AportoError } from "../errors";

export const DEFAULT_APP_BASE_URL = "https://app.aporto.tech";
export const DEFAULT_LLM_BASE_URL = "https://api.aporto.tech/v1";

export function cleanBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/$/, "");
}

export function createJsonHeaders(apiKey: string, agentName?: string): Record<string, string> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };
    if (agentName) headers["X-Agent-Name"] = agentName;
    return headers;
}

export async function apiFetchJson<T>(
    baseUrl: string,
    path: string,
    headers: Record<string, string>,
    body: object,
    label: string,
): Promise<T> {
    const res = await fetch(`${cleanBaseUrl(baseUrl)}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AportoError(
            `${label} failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
            res.status,
        );
    }

    return res.json() as Promise<T>;
}
