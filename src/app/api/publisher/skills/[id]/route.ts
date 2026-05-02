/**
 * GET    /api/publisher/skills/[id] — get single submission detail
 * PATCH  /api/publisher/skills/[id] — edit draft or rejected submission
 * DELETE /api/publisher/skills/[id] — delete draft submission
 */
import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError, pubError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function getOwnedSubmission(publisherId: string, submissionId: number) {
    const rows = await prisma.$queryRawUnsafe<{
        id: number; status: string; description: string; last_edited_at: string | null;
        review_note: string | null;
    }[]>(
        `SELECT id, status, description, "lastEditedAt" AS last_edited_at, "reviewNote" AS review_note
         FROM "SkillSubmission" WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        submissionId, publisherId,
    );
    return rows[0] ?? null;
}

export async function GET(req: NextRequest, { params }: Params) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { id } = await params;
    const submissionId = Number(id);
    if (!submissionId) return pubError("INVALID_ID", "Invalid submission id.", 400);

    const rows = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string; status: string;
        review_note: string | null; category: string | null; tags: string | null;
        params_schema: string | null; created_at: string;
        ai_recommendation: string | null; result_skill_id: number | null; result_provider_id: number | null;
    }[]>(
        `SELECT s.id, s.name, s.description, s.status, s."reviewNote" AS review_note,
                s.category, s.tags, s."paramsSchema" AS params_schema,
                s."createdAt" AS created_at, s."aiRecommendation" AS ai_recommendation,
                s."resultSkillId" AS result_skill_id, s."resultProviderId" AS result_provider_id
         FROM "SkillSubmission" s
         WHERE s.id = $1 AND s."publisherId" = $2`,
        submissionId,
        publisherId,
    );

    if (rows.length === 0) return pubError("NOT_FOUND", "Submission not found.", 404);

    const s = rows[0];
    return NextResponse.json({
        success: true,
        submission: {
            id: s.id,
            name: s.name,
            description: s.description,
            status: s.status,
            reviewNote: s.review_note,
            category: s.category,
            tags: s.tags ? JSON.parse(s.tags) : [],
            paramsSchema: s.params_schema ? JSON.parse(s.params_schema) : {},
            resultSkillId: s.result_skill_id,
            resultProviderId: s.result_provider_id,
            createdAt: s.created_at,
        },
    });
}

export async function PATCH(req: NextRequest, { params }: Params) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { id } = await params;
    const submissionId = Number(id);
    if (!submissionId) return pubError("INVALID_ID", "Invalid submission id.", 400);

    const submission = await getOwnedSubmission(publisherId, submissionId);
    if (!submission) return pubError("NOT_FOUND", "Submission not found.", 404);

    if (submission.status !== "draft" && submission.status !== "rejected") {
        return pubError("SUBMISSION_LOCKED", `Cannot edit a submission with status '${submission.status}'.`, 403);
    }

    const body = await req.json();
    const updates: string[] = [];
    const args: unknown[] = [];
    let i = 1;

    if ("name" in body) { updates.push(`name = $${i++}`); args.push(body.name); }
    if ("description" in body) { updates.push(`description = $${i++}`); args.push(body.description); }
    if ("paramsSchema" in body) { updates.push(`"paramsSchema" = $${i++}`); args.push(body.paramsSchema ? JSON.stringify(body.paramsSchema) : null); }
    if ("tags" in body) { updates.push(`tags = $${i++}`); args.push(body.tags ? JSON.stringify(body.tags) : null); }
    if ("category" in body) { updates.push(`category = $${i++}`); args.push(body.category); }

    if (updates.length === 0) return pubError("NO_CHANGES", "No fields to update.", 400);

    updates.push(`"lastEditedAt" = NOW()`);
    args.push(submissionId);
    await prisma.$executeRawUnsafe(
        `UPDATE "SkillSubmission" SET ${updates.join(", ")} WHERE id = $${i}`,
        ...args,
    );

    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { id } = await params;
    const submissionId = Number(id);
    if (!submissionId) return pubError("INVALID_ID", "Invalid submission id.", 400);

    const submission = await getOwnedSubmission(publisherId, submissionId);
    if (!submission) return pubError("NOT_FOUND", "Submission not found.", 404);

    if (submission.status !== "draft") {
        return pubError("CANNOT_DELETE", "Only draft submissions can be deleted.", 403);
    }

    await prisma.$executeRawUnsafe(
        `DELETE FROM "SkillSubmission" WHERE id = $1`,
        submissionId,
    );

    return NextResponse.json({ success: true });
}
