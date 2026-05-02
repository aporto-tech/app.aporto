/**
 * Publisher provider management for submissions.
 *
 * GET  /api/publisher/providers?submissionId=N  — list providers for my submission
 * POST /api/publisher/providers                 — add provider to my submission
 */
import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError, pubError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";
import { validateEndpointUrl } from "@/lib/ssrfGuard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { searchParams } = new URL(req.url);
    const submissionId = Number(searchParams.get("submissionId") || searchParams.get("skillId"));
    if (!submissionId) return pubError("MISSING_PARAM", "submissionId query parameter is required.", 400);

    // Verify ownership
    const owned = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `SELECT id FROM "SkillSubmission" WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        submissionId, publisherId,
    );
    if (owned.length === 0) return pubError("NOT_FOUND", "Submission not found.", 404);

    const providers = await prisma.$queryRawUnsafe<{
        id: number; name: string; endpoint: string;
        price_per_call: number; cost_per_char: number | null;
        has_secret: boolean;
    }[]>(
        `SELECT id, name, endpoint, "pricePerCall" AS price_per_call, "costPerChar" AS cost_per_char,
                ("providerSecret" IS NOT NULL) AS has_secret
         FROM "SubmissionProvider" WHERE "submissionId" = $1 ORDER BY id ASC`,
        submissionId,
    );

    return NextResponse.json({ success: true, providers });
}

export async function POST(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const body = await req.json();
    const { submissionId, skillId, name, endpoint, providerSecret, pricePerCall, costPerChar } = body;

    const targetId = submissionId || skillId;
    if (!targetId || typeof targetId !== "number") return pubError("MISSING_PARAM", "submissionId is required.", 400);
    if (!name) return pubError("VALIDATION_FAILED", "name is required.", 400, [{ field: "name", code: "REQUIRED" }]);
    if (!endpoint) return pubError("VALIDATION_FAILED", "endpoint is required.", 400, [{ field: "endpoint", code: "REQUIRED" }]);

    // Verify submission ownership and editability
    const subRows = await prisma.$queryRawUnsafe<{ id: number; status: string }[]>(
        `SELECT id, status FROM "SkillSubmission" WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        targetId, publisherId,
    );
    if (subRows.length === 0) return pubError("NOT_FOUND", "Submission not found.", 404);
    if (!["draft", "rejected"].includes(subRows[0].status)) {
        return pubError("SUBMISSION_LOCKED", "Providers can only be added to draft or rejected submissions.", 403);
    }

    // Max 5 providers per submission
    const countRows = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
        `SELECT COUNT(*)::int AS cnt FROM "SubmissionProvider" WHERE "submissionId" = $1`, targetId,
    );
    if ((countRows[0]?.cnt ?? 0) >= 5) {
        return pubError("PROVIDER_LIMIT_REACHED", "Maximum of 5 providers per submission.", 429);
    }

    // HTTPS required
    if (!endpoint.startsWith("https://")) {
        return pubError("VALIDATION_FAILED", "Only HTTPS endpoints are allowed.", 400, [{ field: "endpoint", code: "ENDPOINT_NOT_HTTPS" }]);
    }

    // SSRF guard
    const ssrf = await validateEndpointUrl(endpoint);
    if (!ssrf.ok) {
        return pubError("VALIDATION_FAILED", ssrf.error!, 400, [{ field: "endpoint", code: "SSRF_BLOCKED", detail: ssrf.error }]);
    }

    // providerSecret required
    if (!providerSecret) {
        return pubError("VALIDATION_FAILED", "providerSecret is required.", 400, [
            { field: "providerSecret", code: "REQUIRED", detail: "Generate a strong secret (min 32 chars) on your server." },
        ]);
    }
    if (typeof providerSecret !== "string" || providerSecret.length < 32) {
        return pubError("VALIDATION_FAILED", "providerSecret must be at least 32 characters.", 400, [
            { field: "providerSecret", code: "SECRET_TOO_SHORT", detail: "Minimum 32 characters." },
        ]);
    }

    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "SubmissionProvider" ("submissionId", name, endpoint, "providerSecret", "pricePerCall", "costPerChar")
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        targetId, name, endpoint, providerSecret,
        pricePerCall ?? 0,
        costPerChar ?? null,
    );

    return NextResponse.json({ success: true, id: rows[0].id }, { status: 201 });
}
