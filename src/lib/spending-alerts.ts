import { prisma } from "@/lib/prisma";
import { sendGovernanceAlertEmail } from "@/lib/emails";
import { newApiGetTodayTokenSpend, newApiGetTotalTokenSpend } from "@/lib/newapi";

async function sendAlertEmail(opts: {
    to: string;
    agentName: string;
    percent: number;
    spendUSD: number;
    limitUSD: number;
}) {
    try {
        await sendGovernanceAlertEmail(opts);
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
