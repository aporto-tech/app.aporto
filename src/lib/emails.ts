import { getResend } from "@/lib/resend";

const FROM = "Aporto <noreply@aporto.tech>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.aporto.tech";

function esc(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendWelcomeEmail(email: string, name: string | null): Promise<void> {
    const greeting = name ?? "there";
    const subject = "Welcome to Aporto — your $3 credit is ready";
    const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e2e8f0;padding:32px;border-radius:12px;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#fff;">Welcome to Aporto, ${esc(greeting)}!</h2>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:14px;">
                Your email is verified and your account is ready. We've added <strong style="color:#00dc82;">$3 free credit</strong> to get you started.
            </p>
            <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;">
                Aporto gives your AI agents access to real-world tools — SMS, web search, text-to-speech, image generation — at prices 30% cheaper than official API rates.
            </p>
            <a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 20px;background:#00dc82;color:#000;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                Go to Dashboard →
            </a>
        </div>
    `;

    const resend = getResend();
    await resend.emails.send({ from: FROM, to: email, subject, html });
}

export async function sendTopUpConfirmationEmail(opts: {
    email: string;
    usdPaid: number;
    creditedUSD: number;
    quotaAdded: number;
}): Promise<void> {
    const subject = `Your Aporto account has been topped up — $${opts.creditedUSD.toFixed(2)} added`;
    const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e2e8f0;padding:32px;border-radius:12px;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#fff;">Payment Received</h2>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:14px;">
                Your account has been credited with <strong style="color:#00dc82;">$${opts.creditedUSD.toFixed(2)}</strong> of API usage credit.
            </p>
            <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">
                <tr>
                    <td style="padding:8px 0;color:#64748b;border-bottom:1px solid #1e293b;">Amount paid</td>
                    <td style="padding:8px 0;color:#e2e8f0;text-align:right;border-bottom:1px solid #1e293b;">$${opts.usdPaid.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding:8px 0;color:#64748b;border-bottom:1px solid #1e293b;">API credit (30% discount)</td>
                    <td style="padding:8px 0;color:#00dc82;text-align:right;border-bottom:1px solid #1e293b;">$${opts.creditedUSD.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding:8px 0;color:#64748b;">Quota units added</td>
                    <td style="padding:8px 0;color:#e2e8f0;text-align:right;">${opts.quotaAdded.toLocaleString()}</td>
                </tr>
            </table>
            <a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 20px;background:#00dc82;color:#000;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                View Dashboard →
            </a>
        </div>
    `;

    const resend = getResend();
    await resend.emails.send({ from: FROM, to: opts.email, subject, html });
}

export async function sendGovernanceAlertEmail(opts: {
    to: string;
    agentName: string;
    percent: number;
    spendUSD: number;
    limitUSD: number;
}): Promise<void> {
    const pctStr = opts.percent === 100 ? "100%" : "80%";
    const subject = `⚠️ ${opts.agentName} has reached ${pctStr} of its spending limit`;
    const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e2e8f0;padding:32px;border-radius:12px;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#fff;">Spending Alert</h2>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:14px;">
                Your agent <strong style="color:#fff;">${esc(opts.agentName)}</strong> has used
                <strong style="color:${opts.percent >= 100 ? "#ef4444" : "#f59e0b"};">$${opts.spendUSD.toFixed(2)}</strong>
                of your $${opts.limitUSD.toFixed(2)} limit
                (<strong>${pctStr}</strong>).
            </p>
            ${opts.percent >= 100
                ? `<p style="margin:0 0 20px;color:#ef4444;font-size:14px;">Your agent has hit the limit and may be paused. Add funds or increase the limit.</p>`
                : `<p style="margin:0 0 20px;color:#94a3b8;font-size:14px;">You still have $${(opts.limitUSD - opts.spendUSD).toFixed(2)} remaining.</p>`
            }
            <a href="${APP_URL}/rules" style="display:inline-block;padding:10px 20px;background:#00dc82;color:#000;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                View Rules →
            </a>
        </div>
    `;

    const resend = getResend();
    await resend.emails.send({ from: FROM, to: opts.to, subject, html });
}

export async function sendInsufficientBalanceEmail(opts: {
    email: string;
    currentBalanceUSD: number;
    serviceName?: string;
}): Promise<void> {
    const subject = "Your Aporto balance is empty — add funds to continue";
    const serviceNote = opts.serviceName
        ? `<p style="margin:0 0 12px;color:#94a3b8;font-size:14px;">A recent call to <strong style="color:#fff;">${esc(opts.serviceName)}</strong> could not complete due to insufficient balance.</p>`
        : "";
    const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e2e8f0;padding:32px;border-radius:12px;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#fff;">Balance Empty</h2>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:14px;">
                Your current balance is <strong style="color:#ef4444;">$${opts.currentBalanceUSD.toFixed(2)}</strong>. Your agents will be blocked until you add funds.
            </p>
            ${serviceNote}
            <a href="${APP_URL}/dashboard?topup=1" style="display:inline-block;padding:10px 20px;background:#00dc82;color:#000;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                Add Funds →
            </a>
        </div>
    `;

    const resend = getResend();
    await resend.emails.send({ from: FROM, to: opts.email, subject, html });
}
