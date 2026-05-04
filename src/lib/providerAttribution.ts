import { prisma } from "@/lib/prisma";

const DEFAULT_SUCCESS_THRESHOLD = Number(process.env.PROVIDER_ATTRIBUTION_SUCCESS_THRESHOLD ?? 0.85) || 0.85;
const DEFAULT_MIN_CALLS = Number(process.env.PROVIDER_ATTRIBUTION_MIN_CALLS ?? 20) || 20;

export async function getActiveProviderSkill(providerId: number): Promise<{ providerId: number; skillId: number } | null> {
    const rows = await prisma.$queryRawUnsafe<{ providerId: number; skillId: number }[]>(
        `SELECT p.id AS "providerId", p."skillId"
         FROM "Provider" p
         JOIN "Skill" s ON s.id = p."skillId"
         WHERE p.id = $1
           AND p."isActive" = true
           AND s."isActive" = true
           AND s.status = 'live'
         LIMIT 1`,
        providerId,
    );
    return rows[0] ?? null;
}

export async function createProviderAttribution(params: {
    newApiUserId: number;
    providerId: number;
    source?: string;
}): Promise<{ created: boolean; skillId: number } | null> {
    const provider = await getActiveProviderSkill(params.providerId);
    if (!provider) return null;

    const rows = await prisma.$queryRawUnsafe<{ skillId: number }[]>(
        `INSERT INTO "ProviderAttribution" (
             "newApiUserId", "skillId", "providerId", source, status,
             "successThreshold", "minCalls", "createdAt", "updatedAt"
         )
         VALUES ($1, $2, $3, $4, 'active', $5, $6, NOW(), NOW())
         ON CONFLICT ("newApiUserId", "skillId") DO UPDATE
         SET "providerId" = EXCLUDED."providerId",
             source = EXCLUDED.source,
             status = 'active',
             "successThreshold" = EXCLUDED."successThreshold",
             "minCalls" = EXCLUDED."minCalls",
             "updatedAt" = NOW()
         RETURNING "skillId"`,
        params.newApiUserId,
        provider.skillId,
        params.providerId,
        params.source ?? "referral",
        DEFAULT_SUCCESS_THRESHOLD,
        DEFAULT_MIN_CALLS,
    );

    return rows[0] ? { created: true, skillId: rows[0].skillId } : null;
}
