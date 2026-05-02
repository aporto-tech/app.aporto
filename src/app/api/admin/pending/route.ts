/**
 * GET /api/admin/pending
 * List skill submissions in pending/reviewing status with publisher info.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const submissions = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string;
        params_schema: string | null; tags: string | null; category: string | null;
        status: string; review_note: string | null; ai_recommendation: string | null;
        last_edited_at: string | null; created_at: string;
        publisher_id: string; publisher_name: string; publisher_website: string | null;
        publisher_email: string; publisher_revenue_share: number;
        provider_count: number;
    }[]>(
        `SELECT s.id, s.name, s.description, s."paramsSchema" AS params_schema,
                s.tags, s.category, s.status, s."reviewNote" AS review_note,
                s."aiRecommendation" AS ai_recommendation,
                s."lastEditedAt" AS last_edited_at, s."createdAt" AS created_at,
                p.id AS publisher_id, p."displayName" AS publisher_name,
                p.website AS publisher_website, p."revenueShare" AS publisher_revenue_share,
                u.email AS publisher_email,
                (SELECT COUNT(*)::int FROM "SubmissionProvider" sp WHERE sp."submissionId" = s.id) AS provider_count
         FROM "SkillSubmission" s
         JOIN "Publisher" p ON p.id = s."publisherId"
         JOIN "User" u ON u.id = p."userId"
         WHERE s.status IN ('pending', 'reviewing')
         ORDER BY s."createdAt" ASC`
    );

    return NextResponse.json({ success: true, submissions, count: submissions.length });
}
