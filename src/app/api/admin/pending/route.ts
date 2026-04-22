/**
 * GET /api/admin/pending
 * List skills in pending_review status with publisher info.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const skills = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string;
        params_schema: string | null; tags: string | null; category: string | null;
        review_note: string | null; last_edited_at: string | null; created_at: string;
        publisher_id: string; publisher_name: string; publisher_website: string | null;
        publisher_email: string; publisher_revenue_share: number;
        provider_count: number;
    }[]>(
        `SELECT s.id, s.name, s.description, s."paramsSchema" AS params_schema,
                s.tags, s.category, s."reviewNote" AS review_note,
                s."lastEditedAt" AS last_edited_at, s."createdAt" AS created_at,
                p.id AS publisher_id, p."displayName" AS publisher_name,
                p.website AS publisher_website, p."revenueShare" AS publisher_revenue_share,
                u.email AS publisher_email,
                (SELECT COUNT(*)::int FROM "Provider" pr WHERE pr."skillId" = s.id AND pr."isActive" = true) AS provider_count
         FROM "Skill" s
         JOIN "Publisher" p ON p.id = s."publisherId"
         JOIN "User" u ON u.id = p."userId"
         WHERE s.status = 'pending_review'
         ORDER BY s."createdAt" ASC`
    );

    return NextResponse.json({ success: true, skills, count: skills.length });
}
