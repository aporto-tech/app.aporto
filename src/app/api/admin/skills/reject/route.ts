/**
 * POST /api/admin/skills/reject?id=N
 * Admin rejects a pending_review skill with a reason.
 * Publisher can edit and resubmit.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getResend } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await req.json();
    const { reason } = body;
    if (!reason || typeof reason !== "string" || reason.trim().length < 10) {
        return NextResponse.json({ error: "reason is required (minimum 10 characters) to help the publisher understand what to fix." }, { status: 400 });
    }

    const rows = await prisma.$queryRawUnsafe<{
        id: number; name: string; status: string;
        publisher_name: string; publisher_email: string;
    }[]>(
        `SELECT s.id, s.name, s.status, p."displayName" AS publisher_name, u.email AS publisher_email
         FROM "Skill" s
         JOIN "Publisher" p ON p.id = s."publisherId"
         JOIN "User" u ON u.id = p."userId"
         WHERE s.id = $1 LIMIT 1`,
        id,
    );

    if (rows.length === 0) return NextResponse.json({ error: "Skill not found or not a publisher skill." }, { status: 404 });
    const skill = rows[0];

    if (skill.status !== "pending_review") {
        return NextResponse.json({ error: `Skill status is '${skill.status}', expected 'pending_review'.` }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
        `UPDATE "Skill" SET status = 'rejected', "reviewNote" = $2, "lastEditedAt" = NULL WHERE id = $1`,
        id, reason.trim(),
    );

    void (async () => {
        try {
            const resend = getResend();
            await resend.emails.send({
                from: "Aporto <noreply@aporto.tech>",
                to: skill.publisher_email,
                subject: `Your skill "${skill.name}" needs changes`,
                html: `<p>Hi ${skill.publisher_name},</p>
<p>Your skill <strong>"${skill.name}"</strong> was reviewed and needs changes before it can go live.</p>
<p><strong>Feedback from the reviewer:</strong></p>
<blockquote>${reason.trim()}</blockquote>
<p>Please update your skill in the <a href="https://app.aporto.tech/publisher/skills/${skill.id}">publisher portal</a> and resubmit when ready.</p>`,
            });
        } catch (e) {
            console.error("[admin/skills/reject] email send failed:", { skillId: id, error: String(e) });
        }
    })();

    return NextResponse.json({ success: true, skillId: id, status: "rejected" });
}
