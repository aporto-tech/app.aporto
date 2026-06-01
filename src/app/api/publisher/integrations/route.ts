import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError, pubError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";
import { generateRepoIntegrationPublicId } from "@/lib/repoIntegrations";

export const dynamic = "force-dynamic";

function cleanRepoUrl(value: unknown): string | null {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
        const url = new URL(value.trim());
        if (url.protocol !== "https:") return null;
        return url.toString();
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const rows = await prisma.$queryRawUnsafe<{
        id: string;
        publicId: string;
        name: string;
        repoUrl: string | null;
        status: string;
        revenueShare: number;
        createdAt: string;
        grossUSD: number;
        earningUSD: number;
        unpaidUSD: number;
        paidUSD: number;
        callCount: number;
    }[]>(
        `SELECT ri.id, ri."publicId", ri.name, ri."repoUrl", ri.status, ri."revenueShare", ri."createdAt",
                COALESCE(SUM(r."grossUSD"), 0)::float AS "grossUSD",
                COALESCE(SUM(r."earningUSD"), 0)::float AS "earningUSD",
                COALESCE(SUM(r."earningUSD") FILTER (WHERE r."paidOut" = false), 0)::float AS "unpaidUSD",
                COALESCE(SUM(r."earningUSD") FILTER (WHERE r."paidOut" = true), 0)::float AS "paidUSD",
                COUNT(r.id)::int AS "callCount"
         FROM "RepoIntegration" ri
         LEFT JOIN "RepoIntegrationRevenue" r ON r."integrationId" = ri.id
         WHERE ri."publisherId" = $1
         GROUP BY ri.id, ri."publicId", ri.name, ri."repoUrl", ri.status, ri."revenueShare", ri."createdAt"
         ORDER BY ri."createdAt" DESC`,
        publisherId,
    );

    return NextResponse.json({
        success: true,
        integrations: rows.map((row) => ({
            id: row.id,
            publicId: row.publicId,
            name: row.name,
            repoUrl: row.repoUrl,
            status: row.status,
            revenueShare: Number(row.revenueShare),
            revenueSharePercent: `${Math.round(Number(row.revenueShare) * 100)}%`,
            createdAt: row.createdAt,
            grossUSD: Number(row.grossUSD),
            earningUSD: Number(row.earningUSD),
            unpaidUSD: Number(row.unpaidUSD),
            paidUSD: Number(row.paidUSD),
            callCount: Number(row.callCount),
        })),
    });
}

export async function POST(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const repoUrl = cleanRepoUrl(body.repoUrl);

    if (name.length < 3) {
        return pubError("VALIDATION_FAILED", "name is required (minimum 3 characters).", 400, [
            { field: "name", code: "TOO_SHORT", detail: "Minimum 3 characters" },
        ]);
    }
    if (body.repoUrl && !repoUrl) {
        return pubError("VALIDATION_FAILED", "repoUrl must be a valid HTTPS URL.", 400, [
            { field: "repoUrl", code: "INVALID_URL", detail: "Use an HTTPS repository URL." },
        ]);
    }

    const countRows = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
        `SELECT COUNT(*)::int AS cnt FROM "RepoIntegration" WHERE "publisherId" = $1`,
        publisherId,
    );
    if ((countRows[0]?.cnt ?? 0) >= 50) {
        return pubError("INTEGRATION_LIMIT_REACHED", "Maximum of 50 repository integrations per publisher.", 429);
    }

    const publicId = generateRepoIntegrationPublicId(name);
    const rows = await prisma.$queryRawUnsafe<{ id: string; publicId: string }[]>(
        `INSERT INTO "RepoIntegration" (id, "publisherId", "publicId", name, "repoUrl", status, "revenueShare", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'approved', 0.20, NOW(), NOW())
         RETURNING id, "publicId"`,
        publisherId,
        publicId,
        name,
        repoUrl,
    );

    return NextResponse.json({ success: true, id: rows[0].id, publicId: rows[0].publicId, status: "approved" }, { status: 201 });
}
