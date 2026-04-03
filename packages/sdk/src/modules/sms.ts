import { AportoError } from "../errors";

export interface SendSmsOptions {
    to: string;
}

export interface CheckSmsOptions {
    to: string;
    code: string;
}

export interface SmsResult {
    success: boolean;
    [key: string]: unknown;
}

export function createSmsModule(apiKey: string, agentName?: string) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };
    if (agentName) headers["X-Agent-Name"] = agentName;

    return {
        async send(opts: SendSmsOptions): Promise<SmsResult> {
            const res = await fetch("https://app.aporto.tech/api/services/sms", {
                method: "POST",
                headers,
                body: JSON.stringify({ to: opts.to }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new AportoError(`SMS send failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`, res.status);
            }
            return res.json() as Promise<SmsResult>;
        },

        async check(opts: CheckSmsOptions): Promise<SmsResult> {
            const res = await fetch("https://app.aporto.tech/api/services/sms/check", {
                method: "POST",
                headers,
                body: JSON.stringify({ to: opts.to, code: opts.code }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new AportoError(`SMS check failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`, res.status);
            }
            return res.json() as Promise<SmsResult>;
        },
    };
}
