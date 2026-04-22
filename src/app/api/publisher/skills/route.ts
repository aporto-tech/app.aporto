/**
 * Publisher skill management.
 *
 * GET  /api/publisher/skills          — list my skills
 * POST /api/publisher/skills          — create draft skill
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

    const skills = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string; status: string;
        review_note: string | null; category: string | null; tags: string | null;
        params_schema: string | null; price_per_call: number | null;
        provider_count: number; call_count: number; created_at: string; last_edited_at: string | null;
    }[]>(
        `SELECT s.id, s.name, s.description, s.status, s."reviewNote" AS review_note,
                s.category, s.tags, s."paramsSchema" AS params_schema, s."lastEditedAt" AS last_edited_at,
                s."createdAt" AS created_at,
                COALESCE((SELECT p."pricePerCall" FROM "Provider" p WHERE p."skillId" = s.id AND p."isActive" = true LIMIT 1), 0) AS price_per_call,
                (SELECT COUNT(*)::int FROM "Provider" p WHERE p."skillId" = s.id AND p."isActive" = true) AS provider_count,
                (SELECT COUNT(*)::int FROM "SkillCall" c WHERE c."skillId" = s.id) AS call_count
         FROM "Skill" s
         WHERE s."publisherId" = $1
         ORDER BY s."createdAt" DESC`,
        publisherId,
    );

    // Count pending submissions
    const pendingCount = skills.filter(s => s.status === "pending_review").length;

    return NextResponse.json({
        success: true,
        skills: skills.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            status: s.status,
            reviewNote: s.review_note,
            category: s.category,
            tags: s.tags ? JSON.parse(s.tags) : [],
            paramsSchema: s.params_schema ? JSON.parse(s.params_schema) : {},
            pricePerCall: s.price_per_call,
            providerCount: s.provider_count,
            callCount: s.call_count,
            lastEditedAt: s.last_edited_at,
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

    // Check active skill count limit
    const countRows = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
        `SELECT COUNT(*)::int AS cnt FROM "Skill" WHERE "publisherId" = $1 AND status != 'draft' OR ("publisherId" = $1 AND status = 'draft')`,
        publisherId,
    );
    if ((countRows[0]?.cnt ?? 0) >= 50) {
        return pubError("SKILL_LIMIT_REACHED", "Maximum of 50 skills per publisher.", 429);
    }

    const body = await req.json();
    const { name, description, paramsSchema, tags, category } = body;

    if (!name || typeof name !== "string" || name.trim().length < 3) {
        return pubError("VALIDATION_FAILED", "name is required (minimum 3 characters).", 400, [
            { field: "name", code: "TOO_SHORT", detail: "Minimum 3 characters" },
        ]);
    }

    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "Skill" (name, description, "paramsSchema", tags, category, "isActive", status, "publisherId", "lastEditedAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, false, 'draft', $6, NOW(), NOW())
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
