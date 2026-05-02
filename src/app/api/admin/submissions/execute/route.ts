/**
 * POST /api/admin/submissions/execute?id=N
 * Execute an AI recommendation on a submission.
 * Actions: approve (create skill), merge (add provider to existing), reject
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embeddings";
import { classifySkill, buildEmbedText } from "@/lib/classify";
import { getResend } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const session = await getServerSession(authOptions);
    const adminEmail = session?.user?.email ?? "admin";

    const body = await req.json();
    const { action, reason, targetSkillId } = body;

    if (!action || !["approve", "reject", "merge"].includes(action)) {
        return NextResponse.json({ error: "action must be 'approve', 'reject', or 'merge'" }, { status: 400 });
    }

    // Fetch submission + publisher + providers
    const subRows = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string; status: string;
        params_schema: string | null; tags: string | null; category: string | null;
        publisher_id: string; publisher_name: string; publisher_email: string;
        ai_recommendation: string | null;
    }[]>(
        `SELECT s.id, s.name, s.description, s.status, s."paramsSchema" AS params_schema,
                s.tags, s.category, s."publisherId" AS publisher_id,
                s."aiRecommendation" AS ai_recommendation,
                p."displayName" AS publisher_name, u.email AS publisher_email
         FROM "SkillSubmission" s
         JOIN "Publisher" p ON p.id = s."publisherId"
         JOIN "User" u ON u.id = p."userId"
         WHERE s.id = $1`,
        id,
    );

    if (subRows.length === 0) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    const sub = subRows[0];

    if (!["pending", "reviewing"].includes(sub.status)) {
        return NextResponse.json({ error: `Submission status '${sub.status}' cannot be executed.` }, { status: 400 });
    }

    const providers = await prisma.$queryRawUnsafe<{
        id: number; name: string; endpoint: string; price_per_call: number;
        provider_secret: string | null; cost_per_char: number | null;
    }[]>(
        `SELECT id, name, endpoint, "pricePerCall" AS price_per_call,
                "providerSecret" AS provider_secret, "costPerChar" AS cost_per_char
         FROM "SubmissionProvider" WHERE "submissionId" = $1`,
        id,
    );

    // ─── APPROVE: Create new Skill + Providers ─────────────────────────
    if (action === "approve") {
        const classification = await classifySkill(sub.name, sub.description, sub.params_schema ? JSON.parse(sub.params_schema) : undefined);
        const embedText = buildEmbedText(sub.name, sub.description, classification);
        const embedding = await embedQuery(embedText);
        const vectorLiteral = `[${embedding.join(",")}]`;

        const result = await prisma.$transaction(async (tx) => {
            const skillRows = await tx.$queryRawUnsafe<{ id: number }[]>(
                `INSERT INTO "Skill" (name, description, embedding, "paramsSchema", tags, category, capabilities, "inputTypes", "outputTypes", "isActive", status, "publisherId", "createdAt")
                 VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8, $9, true, 'live', $10, NOW())
                 RETURNING id`,
                sub.name, sub.description, vectorLiteral,
                sub.params_schema,
                sub.tags,
                classification.category,
                JSON.stringify(classification.capabilities),
                JSON.stringify(classification.inputTypes),
                JSON.stringify(classification.outputTypes),
                sub.publisher_id,
            );
            const skillId = skillRows[0].id;

            // Create providers from submission
            let firstProviderId: number | null = null;
            for (const prov of providers) {
                const provRows = await tx.$queryRawUnsafe<{ id: number }[]>(
                    `INSERT INTO "Provider" ("skillId", name, endpoint, "pricePerCall", "costPerChar", "providerSecret", "avgLatencyMs", "retryRate", "timeoutRate", "isActive", "createdAt")
                     VALUES ($1, $2, $3, $4, $5, $6, 500, 0, 0, true, NOW())
                     RETURNING id`,
                    skillId, prov.name, prov.endpoint, prov.price_per_call,
                    prov.cost_per_char, prov.provider_secret,
                );
                if (!firstProviderId) firstProviderId = provRows[0].id;
            }

            // Update submission status
            await tx.$executeRawUnsafe(
                `UPDATE "SkillSubmission" SET status = 'approved', "resultSkillId" = $1, "reviewNote" = $2 WHERE id = $3`,
                skillId, reason ?? "Approved by admin", id,
            );

            return { skillId, firstProviderId };
        });

        // Send email (fire-and-forget)
        void sendApprovalEmail(sub.publisher_email, sub.publisher_name, sub.name, result.skillId);

        console.log(`[admin] Submission ${id} approved → Skill ${result.skillId} by ${adminEmail}`);
        return NextResponse.json({ success: true, action: "approved", skillId: result.skillId });
    }

    // ─── MERGE: Add provider to existing skill ─────────────────────────
    if (action === "merge") {
        const mergeTargetId = targetSkillId || (sub.ai_recommendation ? JSON.parse(sub.ai_recommendation).duplicateSkillId : null);
        if (!mergeTargetId) {
            return NextResponse.json({ error: "targetSkillId required for merge action." }, { status: 400 });
        }

        // Verify target skill exists and is live
        const targetRows = await prisma.$queryRawUnsafe<{ id: number; name: string }[]>(
            `SELECT id, name FROM "Skill" WHERE id = $1 AND "isActive" = true AND status = 'live'`, mergeTargetId,
        );
        if (targetRows.length === 0) {
            return NextResponse.json({ error: "Target skill not found or not live." }, { status: 404 });
        }

        // Add providers to existing skill
        let firstProviderId: number | null = null;
        for (const prov of providers) {
            const provRows = await prisma.$queryRawUnsafe<{ id: number }[]>(
                `INSERT INTO "Provider" ("skillId", name, endpoint, "pricePerCall", "costPerChar", "providerSecret", "avgLatencyMs", "retryRate", "timeoutRate", "isActive", "createdAt")
                 VALUES ($1, $2, $3, $4, $5, $6, 500, 0, 0, true, NOW())
                 RETURNING id`,
                mergeTargetId, prov.name, prov.endpoint, prov.price_per_call,
                prov.cost_per_char, prov.provider_secret,
            );
            if (!firstProviderId) firstProviderId = provRows[0].id;
        }

        // Update submission
        await prisma.$executeRawUnsafe(
            `UPDATE "SkillSubmission" SET status = 'merged', "resultSkillId" = $1, "resultProviderId" = $2,
             "reviewNote" = $3 WHERE id = $4`,
            mergeTargetId, firstProviderId,
            reason ?? `Merged as provider to "${targetRows[0].name}"`, id,
        );

        // Also set publisherId on skill if not already set
        await prisma.$executeRawUnsafe(
            `UPDATE "Skill" SET "publisherId" = COALESCE("publisherId", $1) WHERE id = $2`,
            sub.publisher_id, mergeTargetId,
        );

        void sendMergeEmail(sub.publisher_email, sub.publisher_name, sub.name, targetRows[0].name, mergeTargetId);

        console.log(`[admin] Submission ${id} merged → Provider on Skill ${mergeTargetId} by ${adminEmail}`);
        return NextResponse.json({ success: true, action: "merged", targetSkillId: mergeTargetId, providerId: firstProviderId });
    }

    // ─── REJECT ────────────────────────────────────────────────────────
    if (!reason || reason.length < 10) {
        return NextResponse.json({ error: "Rejection reason must be at least 10 characters." }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
        `UPDATE "SkillSubmission" SET status = 'rejected', "reviewNote" = $1, "lastEditedAt" = NULL WHERE id = $2`,
        reason, id,
    );

    void sendRejectionEmail(sub.publisher_email, sub.publisher_name, sub.name, reason);

    console.log(`[admin] Submission ${id} rejected by ${adminEmail}: ${reason}`);
    return NextResponse.json({ success: true, action: "rejected" });
}

// ─── Email helpers ─────────────────────────────────────────────────────────

async function sendApprovalEmail(email: string, name: string, skillName: string, skillId: number) {
    try {
        const resend = getResend();
        await resend.emails.send({
            from: "Aporto <noreply@aporto.tech>",
            to: email,
            subject: `Your skill "${skillName}" is now live on Aporto`,
            html: `<p>Hi ${name},</p>
<p>Your skill <strong>"${skillName}"</strong> has been approved and is now live on the Aporto marketplace.</p>
<p>Agents can now discover and call your skill. View performance in the <a href="https://app.aporto.tech/publisher/skills">publisher portal</a>.</p>`,
        });
    } catch (e) { console.error("[submissions/execute] approval email failed:", String(e)); }
}

async function sendMergeEmail(email: string, name: string, submissionName: string, targetName: string, skillId: number) {
    try {
        const resend = getResend();
        await resend.emails.send({
            from: "Aporto <noreply@aporto.tech>",
            to: email,
            subject: `Your submission "${submissionName}" — added as provider`,
            html: `<p>Hi ${name},</p>
<p>Your submission <strong>"${submissionName}"</strong> has been reviewed. We found a matching skill <strong>"${targetName}"</strong> already on the marketplace.</p>
<p>Your endpoint has been added as a provider to the existing skill. You'll earn revenue for every call routed to your provider.</p>
<p>View in <a href="https://app.aporto.tech/publisher/skills">publisher portal</a>.</p>`,
        });
    } catch (e) { console.error("[submissions/execute] merge email failed:", String(e)); }
}

async function sendRejectionEmail(email: string, name: string, skillName: string, reason: string) {
    try {
        const resend = getResend();
        await resend.emails.send({
            from: "Aporto <noreply@aporto.tech>",
            to: email,
            subject: `Your skill "${skillName}" needs changes`,
            html: `<p>Hi ${name},</p>
<p>Your submission <strong>"${skillName}"</strong> has been reviewed and needs changes:</p>
<blockquote>${reason}</blockquote>
<p>Please update your submission and resubmit in the <a href="https://app.aporto.tech/publisher/skills">publisher portal</a>.</p>`,
        });
    } catch (e) { console.error("[submissions/execute] rejection email failed:", String(e)); }
}
