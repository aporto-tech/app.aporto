import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession, deductUserQuota, logServiceUsage } from "@/lib/serviceProxy";

export const dynamic = "force-dynamic";

const PRELUDE_BASE = "https://api.prelude.dev/v2";
const COST_SEND = 0.015; // $0.015 per verification sent

export async function POST(req: NextRequest) {
    try {
        const auth = await validateApiKeyOrSession(req);
        if (!auth) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { to, type = "sms" } = body;

        if (!to) {
            return NextResponse.json({ success: false, message: "Missing required field: to" }, { status: 400 });
        }

        // Check balance and deduct
        const balanceError = await deductUserQuota(auth.newApiUserId, COST_SEND);
        if (balanceError) return balanceError;

        // Call Prelude
        const res = await fetch(`${PRELUDE_BASE}/verification`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.PRELUDE_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                target: { type: "phone_number", value: to },
                ...(type === "whatsapp" ? { dispatch_id: "whatsapp" } : {}),
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            // Refund on provider error
            await import("@/lib/prisma").then(({ prisma }) =>
                prisma.$executeRawUnsafe(
                    `UPDATE users SET quota = quota + $1, used_quota = used_quota - $1 WHERE id = $2`,
                    Math.ceil(COST_SEND * 500_000),
                    auth.newApiUserId
                )
            );
            return NextResponse.json(
                { success: false, message: data.message ?? "Prelude error", detail: data },
                { status: res.status }
            );
        }

        await logServiceUsage(auth.newApiUserId, "sms", "prelude", COST_SEND, { to, type, status: "sent" });

        return NextResponse.json({ success: true, ...data, costUSD: COST_SEND });
    } catch (error) {
        console.error("[services/sms] POST error:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}
