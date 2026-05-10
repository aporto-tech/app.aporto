import { AportoNotAvailableError } from "../errors";
import { DEFAULT_APP_BASE_URL, apiFetchJson, createJsonHeaders } from "./http";

export interface SendSmsOptions {
    to: string;
    type?: "sms" | "whatsapp";
}

export interface CheckSmsOptions {
    to: string;
    code: string;
}

export interface SmsResult {
    success: boolean;
    [key: string]: unknown;
}

export function createSmsModule(apiKey: string, agentName?: string, appBaseUrl = DEFAULT_APP_BASE_URL) {
    const headers = createJsonHeaders(apiKey, agentName);

    return {
        async send(opts: SendSmsOptions): Promise<SmsResult> {
            return apiFetchJson<SmsResult>(
                appBaseUrl,
                "/api/services/sms",
                headers,
                { to: opts.to, type: opts.type ?? "sms" },
                "SMS send",
            );
        },

        async check(): Promise<SmsResult> {
            throw new AportoNotAvailableError("sms.check");
        },
    };
}
