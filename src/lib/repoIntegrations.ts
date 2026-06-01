import { randomBytes, randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const INTEGRATION_ID_RE = /^ri_[A-Za-z0-9_-]{3,96}$/;

export function normalizeRepoIntegrationId(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return INTEGRATION_ID_RE.test(trimmed) ? trimmed : null;
}

export function extractRepoIntegrationId(req: NextRequest): string | null {
    return normalizeRepoIntegrationId(req.headers.get("x-aporto-integration-id"))
        ?? normalizeRepoIntegrationId(req.nextUrl.searchParams.get("integration_id"))
        ?? normalizeRepoIntegrationId(req.nextUrl.searchParams.get("aporto_integration_id"));
}

export function generateRepoIntegrationPublicId(name?: string): string {
    const base = name
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
    const suffix = randomBytes(5).toString("base64url");
    return `ri_${base ? `${base}_` : ""}${suffix}`;
}

export async function createRepoIntegrationRevenue(params: {
    integrationPublicId?: string | null;
    newApiUserId: number;
    grossUSD: number;
    providerCostUSD?: number | null;
    requestId?: string | null;
    skillCallId?: number | null;
    skillRunId?: string | null;
    model?: string | null;
}): Promise<{ created: boolean; earningUSD?: number } | null> {
    const publicId = normalizeRepoIntegrationId(params.integrationPublicId);
    if (!publicId || params.grossUSD <= 0) return null;

    const rows = await prisma.$queryRawUnsafe<{
        id: string;
        revenueShare: number;
        ownerNewApiUserId: number | null;
    }[]>(
        `SELECT ri.id, ri."revenueShare", u."newApiUserId" AS "ownerNewApiUserId"
         FROM "RepoIntegration" ri
         JOIN "Publisher" p ON p.id = ri."publisherId"
         JOIN "User" u ON u.id = p."userId"
         WHERE ri."publicId" = $1
           AND ri.status IN ('approved', 'active')
           AND p.status != 'suspended'
         LIMIT 1`,
        publicId,
    );

    const integration = rows[0];
    if (!integration) return null;
    if (integration.ownerNewApiUserId === params.newApiUserId) return null;

    const providerCostUSD = params.providerCostUSD ?? null;
    const netUSD = providerCostUSD == null
        ? params.grossUSD
        : Math.max(params.grossUSD - providerCostUSD, 0);
    const revenueShare = Number(integration.revenueShare);
    const earningUSD = Math.max(netUSD, 0) * revenueShare;
    if (earningUSD <= 0) return null;

    const inserted = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "RepoIntegrationRevenue" (
             id, "integrationId", "newApiUserId", "requestId", "skillCallId", "skillRunId",
             model, "grossUSD", "providerCostUSD", "netUSD", "revenueShare", "earningUSD",
             "paidOut", "createdAt"
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, NOW())
         ON CONFLICT DO NOTHING
         RETURNING id`,
        randomUUID(),
        integration.id,
        params.newApiUserId,
        params.requestId ?? null,
        params.skillCallId ?? null,
        params.skillRunId ?? null,
        params.model ?? null,
        params.grossUSD,
        providerCostUSD,
        netUSD,
        revenueShare,
        earningUSD,
    );

    return { created: inserted.length > 0, earningUSD };
}
