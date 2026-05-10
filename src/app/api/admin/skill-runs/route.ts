import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "30") || 30));
    const status = searchParams.get("status") || "failed";

    const runs = await prisma.$queryRawUnsafe<{
        id: string;
        created_at: string;
        updated_at: string;
        status: string;
        lifecycle_mode: string;
        skill_name: string;
        skill_category: string | null;
        provider_name: string | null;
        provider_task_id: string | null;
        cost_usd: number | null;
        attempts: number;
        error: unknown;
        result: unknown;
        session_id: string;
        new_api_user_id: number;
        resolved_at: string | null;
        resolved_by: string | null;
        resolution_note: string | null;
    }[]>(
        `SELECT
            sr.id,
            sr."createdAt"::text AS created_at,
            sr."updatedAt"::text AS updated_at,
            sr.status,
            sr."lifecycleMode" AS lifecycle_mode,
            s.name AS skill_name,
            s.category AS skill_category,
            p.name AS provider_name,
            sr."providerTaskId" AS provider_task_id,
            sr."costUSD" AS cost_usd,
            sr.attempts,
            sr.error,
            sr.result,
            sr."sessionId" AS session_id,
            sr."newApiUserId" AS new_api_user_id,
            sr."resolvedAt"::text AS resolved_at,
            sr."resolvedBy" AS resolved_by,
            sr."resolutionNote" AS resolution_note
         FROM "SkillRun" sr
         JOIN "Skill" s ON s.id = sr."skillId"
         LEFT JOIN "Provider" p ON p.id = sr."providerId"
         WHERE sr.status = $1
         ORDER BY sr."createdAt" DESC
         LIMIT $2`,
        status,
        limit,
    );

    return NextResponse.json({
        success: true,
        runs: runs.map((run) => ({
            ...run,
            error: run.error ?? null,
            result: run.result ?? null,
        })),
    });
}
