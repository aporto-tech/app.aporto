/**
 * PATCH /api/publisher/skills/[id]   — edit draft or rejected skill
 * DELETE /api/publisher/skills/[id]  — soft-delete draft skill
 * POST /api/publisher/skills/[id]/submit  — submit draft → pending_review
 */
import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError, pubError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function getOwnedSkill(publisherId: string, skillId: number) {
    const rows = await prisma.$queryRawUnsafe<{
        id: number; status: string; description: string; last_edited_at: string | null;
        review_note: string | null;
    }[]>(
        `SELECT id, status, description, "lastEditedAt" AS last_edited_at, "reviewNote" AS review_note
         FROM "Skill" WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        skillId, publisherId,
    );
    return rows[0] ?? null;
}

export async function GET(req: NextRequest, { params }: Params) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { id } = await params;
    const skillId = Number(id);
    if (!skillId) return pubError("INVALID_ID", "Invalid skill id.", 400);

    const rows = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string; status: string;
        review_note: string | null; category: string | null; tags: string | null;
        params_schema: string | null; call_count: number; created_at: string;
    }[]>(
        `SELECT s.id, s.name, s.description, s.status, s."reviewNote" AS review_note,
                s.category, s.tags, s."paramsSchema" AS params_schema,
                s."createdAt" AS created_at,
                (SELECT COUNT(*)::int FROM "SkillCall" c WHERE c."skillId" = s.id) AS call_count
         FROM "Skill" s
         WHERE s.id = $1 AND s."publisherId" = $2`,
        skillId,
        publisherId,
    );

    if (rows.length === 0) return pubError("NOT_FOUND", "Skill not found.", 404);

    const s = rows[0];
    return NextResponse.json({
        success: true,
        skill: {
            id: s.id,
            name: s.name,
            description: s.description,
            status: s.status,
            reviewNote: s.review_note,
            category: s.category,
            tags: s.tags ? JSON.parse(s.tags) : [],
            paramsSchema: s.params_schema ? JSON.parse(s.params_schema) : {},
            callCount: s.call_count,
            createdAt: s.created_at,
        },
    });
}

export async function PATCH(req: NextRequest, { params }: Params) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { id } = await params;
    const skillId = Number(id);
    if (!skillId) return pubError("INVALID_ID", "Invalid skill id.", 400);

    const skill = await getOwnedSkill(publisherId, skillId);
    if (!skill) return pubError("NOT_FOUND", "Skill not found.", 404);

    if (skill.status !== "draft" && skill.status !== "rejected") {
        return pubError("SKILL_LOCKED", `Cannot edit a skill with status '${skill.status}'. Only draft and rejected skills can be edited.`, 403);
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
    if ("inputSchema" in body) { updates.push(`"inputSchema" = $${i++}`); args.push(body.inputSchema ? JSON.stringify(body.inputSchema) : null); }

    if (updates.length === 0) return pubError("NO_CHANGES", "No fields to update.", 400);

    updates.push(`"lastEditedAt" = NOW()`);
    args.push(skillId);
    await prisma.$executeRawUnsafe(
        `UPDATE "Skill" SET ${updates.join(", ")} WHERE id = $${i}`,
        ...args,
    );

    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { id } = await params;
    const skillId = Number(id);
    if (!skillId) return pubError("INVALID_ID", "Invalid skill id.", 400);

    const skill = await getOwnedSkill(publisherId, skillId);
    if (!skill) return pubError("NOT_FOUND", "Skill not found.", 404);

    if (skill.status === "live") {
        return pubError("CANNOT_DELETE_LIVE_SKILL", "Cannot delete a live skill. Contact support to remove a live skill.", 403);
    }
    if (skill.status === "pending_review") {
        return pubError("CANNOT_DELETE_PENDING", "Cannot delete a skill that is under review.", 403);
    }

    // Soft delete: archive the skill
    await prisma.$executeRawUnsafe(
        `UPDATE "Skill" SET status = 'archived', "isActive" = false WHERE id = $1`,
        skillId,
    );

    return NextResponse.json({ success: true });
}
