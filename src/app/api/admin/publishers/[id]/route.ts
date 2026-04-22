/**
 * POST /api/admin/publishers/[id]
 * Body: { action: "approve" | "suspend", revenueShare?: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getResend } from "@/lib/resend";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const session = await getServerSession(authOptions);
    const adminEmail = session?.user?.email ?? "admin";

    const { id: publisherId } = await params;
    const body = await req.json();
    const { action, revenueShare } = body;

    if (action !== "approve" && action !== "suspend") {
        return NextResponse.json({ error: "action must be 'approve' or 'suspend'" }, { status: 400 });
    }

    const rows = await prisma.$queryRawUnsafe<{
        id: string; display_name: string; status: string; email: string;
    }[]>(
        `SELECT p.id, p."displayName" AS display_name, p.status, u.email
         FROM "Publisher" p JOIN "User" u ON u.id = p."userId"
         WHERE p.id = $1 LIMIT 1`,
        publisherId,
    );

    if (rows.length === 0) return NextResponse.json({ error: "Publisher not found." }, { status: 404 });
    const publisher = rows[0];

    if (action === "approve") {
        const updates: string[] = [`status = 'approved'`, `"approvedAt" = NOW()`, `"approvedBy" = '${adminEmail}'`];
        if (revenueShare != null && typeof revenueShare === "number") {
            updates.push(`"revenueShare" = ${revenueShare}`);
        }
        await prisma.$executeRawUnsafe(
            `UPDATE "Publisher" SET ${updates.join(", ")} WHERE id = $1`,
            publisherId,
        );

        void (async () => {
            try {
                const resend = getResend();
                await resend.emails.send({
                    from: "Aporto <noreply@aporto.tech>",
                    to: publisher.email,
                    subject: "Welcome to Aporto Publishers!",
                    html: `<p>Hi ${publisher.display_name},</p>
<p>Your publisher application has been approved! You can now create and submit skills to the Aporto marketplace.</p>
<p><strong>Get started:</strong></p>
<ol>
  <li><a href="https://app.aporto.tech/publisher/onboarding">Create your first API key</a></li>
  <li>Register your first skill</li>
  <li>Submit it for review</li>
</ol>
<p>Your revenue share is ${Math.round((revenueShare ?? 0.85) * 100)}% of each skill call.</p>`,
                });
            } catch (e) {
                console.error("[admin/publishers] approval email failed:", { publisherId, error: String(e) });
            }
        })();
    } else {
        await prisma.$executeRawUnsafe(
            `UPDATE "Publisher" SET status = 'suspended' WHERE id = $1`,
            publisherId,
        );
    }

    return NextResponse.json({ success: true, publisherId, action });
}
