import { AportoError } from "../errors";

const APP_URL = "https://app.aporto.tech";

export class AportoPaymentError extends AportoError {
    readonly code: "INSUFFICIENT_BALANCE" | "PAY_FAILED" | "UNSUPPORTED_NETWORK";
    constructor(message: string, code: AportoPaymentError["code"], status: number) {
        super(message, status);
        this.name = "AportoPaymentError";
        this.code = code;
    }
}

export interface CreateX402FetchOptions {
    apiKey: string;
}

/**
 * Returns a fetch-compatible function that auto-pays x402 responses using your
 * Aporto balance and retries the original request with the proof header.
 *
 * Only intercepts responses with:
 *   - HTTP status 402
 *   - X-Payment-Network: aporto
 *
 * All other responses (including non-aporto 402s) pass through unchanged.
 *
 * Usage:
 *   const fetch = createX402Fetch({ apiKey: "sk-live-..." });
 *   const res = await fetch("https://some-x402-api.com/data");
 */
export function createX402Fetch(options: CreateX402FetchOptions) {
    const { apiKey } = options;

    return async function x402Fetch(
        input: RequestInfo | URL,
        init?: RequestInit
    ): Promise<Response> {
        // First attempt
        const firstRes = await fetch(input, init);

        // Not a 402 or not an Aporto x402 payment request — pass through
        if (
            firstRes.status !== 402 ||
            firstRes.headers.get("X-Payment-Network") !== "aporto"
        ) {
            return firstRes;
        }

        const network = firstRes.headers.get("X-Payment-Network")!;
        const recipient = firstRes.headers.get("X-Payment-Recipient") ?? "";
        const amount = firstRes.headers.get("X-Payment-Amount") ?? "";

        if (!recipient || !amount) {
            // Malformed 402 — pass through the original response
            return firstRes;
        }

        // Pay via Aporto
        const payRes = await fetch(`${APP_URL}/api/x402/pay`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ network, recipient, amount }),
        });

        if (!payRes.ok) {
            const body = await payRes.json().catch(() => ({}));
            const message = (body as { message?: string }).message ?? "Payment failed";

            if (payRes.status === 402) {
                throw new AportoPaymentError(
                    `x402 payment blocked: ${message}`,
                    "INSUFFICIENT_BALANCE",
                    402
                );
            }

            throw new AportoPaymentError(
                `x402 payment failed: ${message}`,
                "PAY_FAILED",
                payRes.status
            );
        }

        const { proof } = (await payRes.json()) as { proof: string };

        // Retry original request with proof header (max 1 retry)
        const retryInit: RequestInit = {
            ...init,
            headers: {
                ...(init?.headers ?? {}),
                "X-Payment-Proof": proof,
            },
        };

        return fetch(input, retryInit);
    };
}
