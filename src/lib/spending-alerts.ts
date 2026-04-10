import { prisma } from "@/lib/prisma";
import { getResend } from "@/lib/resend";
import { newApiGetTodayTokenSpend, newApiGetTotalTokenSpend } from "@/lib/newapi";

const FROM = "Aporto <noreply@aporto.tech>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.aporto.tech";

async function sendAlertEmail(opts: {
    to: string;
    agentName: string;
    percent: number;
    spendUSD: number;
    limitUSD: number;
}) {
    const pctStr = opts.percent === 100 ? "100%" : "80%";
    const subject = `⚠️ ${opts.agentName} has reached ${pctStr} of its spending limit`;
    const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e2e8f0;padding:32px;border-radius:12px;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#fff;">Spending Alert</h2>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:14px;">
                Your agent <strong style="color:#fff;">${opts.agentName}</strong> has used
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

    try {
        const resend = getResend();
        await resend.emails.send({ from: FROM, to: opts.to, subject, html });
    } catch (err) {
        console.error("[spending-alerts] Failed to send email:", err);
    }
}

async function sendAlertWebhook(opts: {
    webhookUrl: string;
    agentName: string;
    percent: number;
    spendUSD: number;
    limitUSD: number;
}) {
    try {
        await fetch(opts.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                event: "spending_alert",
                agent: opts.agentName,
                percent: opts.percent,
                spendUSD: opts.spendUSD,
                limitUSD: opts.limitUSD,
                timestamp: new Date().toISOString(),
            }),
        });
    } catch (err) {
        console.error("[spending-alerts] Webhook delivery failed:", err);
    }
}

export async function runSpendingAlerts(): Promise<{ processed: number; alerted: number }> {
    const rules = await prisma.rule.findMany({
        where: {
            enabled: true,
            type: { in: ["total_limit", "daily_limit"] },
            limitUSD: { not: null, gt: 0 },
        },
    });

    if (rules.length === 0) return { processed: 0, alerted: 0 };

    // Gather unique user IDs and their emails
    const userIds = [...new Set(rules.map(r => r.newApiUserId))];
    const users = await prisma.user.findMany({
        where: { newApiUserId: { in: userIds } },
        select: { newApiUserId: true, email: true },
    });
    const emailMap = new Map<number, string>(
        users.filter(u => u.newApiUserId && u.email).map(u => [u.newApiUserId!, u.email!])
    );

    let alerted = 0;
    const startOfTodayUTC = new Date();
    startOfTodayUTC.setUTCHours(0, 0, 0, 0);

    for (const rule of rules) {
        const limitUSD = rule.limitUSD!;
        const email = emailMap.get(rule.newApiUserId);
        if (!email) continue;

        // Get current spend
        let spendUSD: number;
        if (rule.type === "daily_limit") {
            spendUSD = await newApiGetTodayTokenSpend(rule.tokenId);
        } else {
            spendUSD = await newApiGetTotalTokenSpend(rule.tokenId);
        }

        const pct = limitUSD > 0 ? spendUSD / limitUSD : 0;

        // Reset daily alert flags if they were sent before today
        const updates: Partial<{ alert80SentAt: null; alert100SentAt: null }> = {};
        if (rule.type === "daily_limit") {
            if (rule.alert80SentAt && rule.alert80SentAt < startOfTodayUTC) {
                updates.alert80SentAt = null;
            }
            if (rule.alert100SentAt && rule.alert100SentAt < startOfTodayUTC) {
                updates.alert100SentAt = null;
            }
            if (Object.keys(updates).length > 0) {
                await prisma.rule.update({ where: { id: rule.id }, data: updates });
                rule.alert80SentAt = null;
                rule.alert100SentAt = null;
            }
        }

        // Check 100% threshold
        if (pct >= 1.0 && !rule.alert100SentAt) {
            await prisma.rule.update({ where: { id: rule.id }, data: { alert100SentAt: new Date() } });
            await sendAlertEmail({ to: email, agentName: rule.tokenName, percent: 100, spendUSD, limitUSD });
            if (rule.webhookUrl) {
                await sendAlertWebhook({ webhookUrl: rule.webhookUrl, agentName: rule.tokenName, percent: 100, spendUSD, limitUSD });
            }
            alerted++;
        }

        // Check 80% threshold (only if not yet hit 100%)
        if (pct >= 0.8 && pct < 1.0 && !rule.alert80SentAt) {
            await prisma.rule.update({ where: { id: rule.id }, data: { alert80SentAt: new Date() } });
            await sendAlertEmail({ to: email, agentName: rule.tokenName, percent: 80, spendUSD, limitUSD });
            if (rule.webhookUrl) {
                await sendAlertWebhook({ webhookUrl: rule.webhookUrl, agentName: rule.tokenName, percent: 80, spendUSD, limitUSD });
            }
            alerted++;
        }
    }

    return { processed: rules.length, alerted };
}
