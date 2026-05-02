/**
 * Publisher skill submissions.
 *
 * GET  /api/publisher/skills — list my submissions + live skills (where I'm a provider)
 * POST /api/publisher/skills — create draft submission
 */
import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError, pubError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    // Get submissions
    const submissions = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string; status: string;
        review_note: string | null; category: string | null;
        provider_count: number; created_at: string; result_skill_id: number | null;
    }[]>(
        `SELECT s.id, s.name, s.description, s.status, s."reviewNote" AS review_note,
                s.category, s."createdAt" AS created_at,
                s."resultSkillId" AS result_skill_id,
                (SELECT COUNT(*)::int FROM "SubmissionProvider" sp WHERE sp."submissionId" = s.id) AS provider_count
         FROM "SkillSubmission" s
         WHERE s."publisherId" = $1
         ORDER BY s."createdAt" DESC`,
        publisherId,
    );

    // Get live skills where this publisher is a provider (via existing Skill table)
    const liveSkills = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string; category: string | null;
        call_count: number; created_at: string;
    }[]>(
        `SELECT DISTINCT s.id, s.name, s.description, s.category, s."createdAt" AS created_at,
                (SELECT COUNT(*)::int FROM "SkillCall" c WHERE c."skillId" = s.id) AS call_count
         FROM "Skill" s
         JOIN "Provider" p ON p."skillId" = s.id AND p."isActive" = true
         WHERE s."publisherId" = $1 AND s.status = 'live' AND s."isActive" = true
         ORDER BY s."createdAt" DESC`,
        publisherId,
    );

    const pendingCount = submissions.filter(s => s.status === "pending").length;

    return NextResponse.json({
        success: true,
        submissions: submissions.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            status: s.status,
            reviewNote: s.review_note,
            category: s.category,
            providerCount: s.provider_count,
            resultSkillId: s.result_skill_id,
            createdAt: s.created_at,
        })),
        liveSkills: liveSkills.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            category: s.category,
            callCount: s.call_count,
            createdAt: s.created_at,
        })),
        submissionsUsed: pendingCount,
        submissionsRemaining: Math.max(0, 10 - pendingCount),
    });
}

export async function POST(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    // Check submission limit (50 total)
    const countRows = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
        `SELECT COUNT(*)::int AS cnt FROM "SkillSubmission" WHERE "publisherId" = $1`,
        publisherId,
    );
    if ((countRows[0]?.cnt ?? 0) >= 50) {
        return pubError("SKILL_LIMIT_REACHED", "Maximum of 50 submissions per publisher.", 429);
    }

    const body = await req.json();
    const { name, description, paramsSchema, tags, category } = body;

    if (!name || typeof name !== "string" || name.trim().length < 3) {
        return pubError("VALIDATION_FAILED", "name is required (minimum 3 characters).", 400, [
            { field: "name", code: "TOO_SHORT", detail: "Minimum 3 characters" },
        ]);
    }

    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "SkillSubmission" (name, description, "paramsSchema", tags, category, status, "publisherId", "lastEditedAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, 'draft', $6, NOW(), NOW())
         RETURNING id`,
        name.trim(),
        description ?? "",
        paramsSchema ? JSON.stringify(paramsSchema) : null,
        tags ? JSON.stringify(tags) : null,
        category ?? null,
        publisherId,
    );

    return NextResponse.json({ success: true, id: rows[0].id, status: "draft" }, { status: 201 });
}
