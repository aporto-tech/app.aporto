/**
 * POST /api/admin/skills/approve?id=N
 * Admin approves a pending_review skill → status = "live".
 * Idempotent: already-live skills return 200 no-op.
 * Email to publisher is fire-and-forget (approval is authoritative).
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getResend } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const session = await getServerSession(authOptions);
    const adminEmail = session?.user?.email ?? "admin";

    // Fetch skill + publisher info
    const rows = await prisma.$queryRawUnsafe<{
        id: number; name: string; status: string;
        publisher_id: string; publisher_name: string; publisher_email: string;
    }[]>(
        `SELECT s.id, s.name, s.status,
                p.id AS publisher_id, p."displayName" AS publisher_name,
                u.email AS publisher_email
         FROM "Skill" s
         JOIN "Publisher" p ON p.id = s."publisherId"
         JOIN "User" u ON u.id = p."userId"
         WHERE s.id = $1 LIMIT 1`,
        id,
    );

    if (rows.length === 0) return NextResponse.json({ error: "Skill not found or not a publisher skill." }, { status: 404 });
    const skill = rows[0];

    // Idempotent — already live is a no-op
    if (skill.status === "live") {
        return NextResponse.json({ success: true, alreadyLive: true });
    }

    if (skill.status !== "pending_review") {
        return NextResponse.json({ error: `Skill status is '${skill.status}', expected 'pending_review'.` }, { status: 400 });
    }

    // Set status = live first (authoritative)
    await prisma.$executeRawUnsafe(
        `UPDATE "Skill" SET status = 'live', "isActive" = true, "reviewNote" = NULL WHERE id = $1`,
        id,
    );

    // Send notification email — fire-and-forget
    void (async () => {
        try {
            const resend = getResend();
            await resend.emails.send({
                from: "Aporto <noreply@aporto.tech>",
                to: skill.publisher_email,
                subject: `Your skill "${skill.name}" is now live on Aporto`,
                html: `<p>Hi ${skill.publisher_name},</p>
<p>Great news! Your skill <strong>"${skill.name}"</strong> has been approved and is now live on the Aporto marketplace.</p>
<p>Agents can now discover and call your skill. You can view its performance in the <a href="https://app.aporto.tech/publisher/skills/${skill.id}">publisher portal</a>.</p>
<p>Thank you for building on Aporto.</p>`,
            });
        } catch (e) {
            console.error("[admin/skills/approve] email send failed:", { skillId: id, error: String(e) });
        }
    })();

    console.log(`[admin] Skill ${id} approved by ${adminEmail}`);

    return NextResponse.json({ success: true, skillId: id, status: "live" });
}
