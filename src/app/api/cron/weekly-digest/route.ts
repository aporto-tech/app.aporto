import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend } from "@/lib/resend";
import {
    newApiGetWeeklySpend,
    newApiGetWeeklyAgentSpend,
    newApiGetTopModelThisWeek,
} from "@/lib/newapi";

const FROM = "Aporto <noreply@aporto.tech>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.aporto.tech";

export async function POST(req: Request) {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const users = await prisma.user.findMany({
            where: {
                email: { not: null },
                newApiUserId: { not: null },
            },
            select: { email: true, name: true, newApiUserId: true },
        });

        const now = new Date();
        const weekStart = new Date(now.getTime() - 7 * 86400 * 1000);
        const weekStartStr = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const weekEndStr = new Date(now.getTime() - 86400 * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

        let sent = 0;
        let skipped = 0;

        const resend = getResend();

        for (const user of users) {
            if (!user.email || !user.newApiUserId) continue;

            const totalSpend = await newApiGetWeeklySpend(user.newApiUserId);
            if (totalSpend === 0) {
                skipped++;
                continue;
            }

            const agentSpend = await newApiGetWeeklyAgentSpend(user.newApiUserId);
            const topModel = await newApiGetTopModelThisWeek(user.newApiUserId);

            const agentRows = agentSpend
                .map(a => `
                    <tr>
                        <td style="padding:6px 0;font-size:14px;color:#e2e8f0;">${a.tokenName}</td>
                        <td style="padding:6px 0;font-size:14px;color:#00dc82;text-align:right;">$${a.usdAmount.toFixed(4)}</td>
                    </tr>
                `)
                .join("");

            const html = `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e2e8f0;padding:32px;border-radius:12px;">
                    <h2 style="margin:0 0 6px;font-size:20px;color:#fff;">Weekly Spend Digest</h2>
                    <p style="margin:0 0 24px;font-size:13px;color:#555;">${weekStartStr} — ${weekEndStr}</p>

                    <div style="background:#0d1117;border:1px solid #1a1a1a;border-radius:10px;padding:20px;margin-bottom:20px;">
                        <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Total Spend</div>
                        <div style="font-size:32px;font-weight:700;color:#fff;">$${totalSpend.toFixed(4)}</div>
                    </div>

                    ${agentSpend.length > 0 ? `
                    <div style="background:#0d1117;border:1px solid #1a1a1a;border-radius:10px;padding:20px;margin-bottom:20px;">
                        <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">By Agent</div>
                        <table style="width:100%;border-collapse:collapse;">
                            ${agentRows}
                        </table>
                    </div>
                    ` : ""}

                    ${topModel !== "—" ? `
                    <div style="background:#0d1117;border:1px solid #1a1a1a;border-radius:10px;padding:20px;margin-bottom:24px;">
                        <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Most Used Model</div>
                        <div style="font-size:15px;color:#fff;font-weight:600;">${topModel}</div>
                    </div>
                    ` : ""}

                    <a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 20px;background:#00dc82;color:#000;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                        View Full Analytics →
                    </a>

                    <p style="margin:24px 0 0;font-size:11px;color:#333;">
                        You're receiving this because you have an Aporto account.
                    </p>
                </div>
            `;

            const displayName = user.name ?? user.email;
            const subject = `Your AI agents spent $${totalSpend.toFixed(2)} this week`;

            await resend.emails.send({
                from: FROM,
                to: user.email,
                subject,
                html,
            });
            sent++;
        }

        return NextResponse.json({ success: true, sent, skipped });
    } catch (err) {
        console.error("[cron/weekly-digest] Error:", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
