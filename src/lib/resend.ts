import { Resend } from "resend";

// Lazy initialization — avoid crashing at build time when RESEND_API_KEY is not set
let _resend: Resend | null = null;

export function getResend(): Resend {
    if (!_resend) {
        const key = process.env.RESEND_API_KEY;
        if (!key) {
            throw new Error(
                "RESEND_API_KEY is not set. Add it to .env.local to enable password reset emails."
            );
        }
        _resend = new Resend(key);
    }
    return _resend;
}

/** @deprecated use getResend() instead */
export const resend = { emails: { send: (...args: Parameters<Resend["emails"]["send"]>) => getResend().emails.send(...args) } };
