/**
 * Publisher provider management.
 *
 * GET  /api/publisher/providers?skillId=N  — list providers for my skill
 * POST /api/publisher/providers            — add provider to my skill
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
    const skillId = Number(searchParams.get("skillId"));
    if (!skillId) return pubError("MISSING_PARAM", "skillId query parameter is required.", 400);

    // Verify ownership
    const owned = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `SELECT id FROM "Skill" WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        skillId, publisherId,
    );
    if (owned.length === 0) return pubError("NOT_FOUND", "Skill not found.", 404);

    const providers = await prisma.$queryRawUnsafe<{
        id: number; name: string; endpoint: string;
        price_per_call: number; cost_per_char: number | null;
        has_secret: boolean; is_active: boolean; created_at: string;
    }[]>(
        `SELECT id, name, endpoint, "pricePerCall" AS price_per_call, "costPerChar" AS cost_per_char,
                ("providerSecret" IS NOT NULL) AS has_secret, "isActive" AS is_active, "createdAt" AS created_at
         FROM "Provider" WHERE "skillId" = $1 ORDER BY "createdAt" ASC`,
        skillId,
    );

    return NextResponse.json({ success: true, providers });
}

export async function POST(req: NextRequest) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const body = await req.json();
    const { skillId, name, endpoint, providerSecret, pricePerCall, costPerChar } = body;

    if (!skillId || typeof skillId !== "number") return pubError("MISSING_PARAM", "skillId is required.", 400);
    if (!name) return pubError("VALIDATION_FAILED", "name is required.", 400, [{ field: "name", code: "REQUIRED" }]);
    if (!endpoint) return pubError("VALIDATION_FAILED", "endpoint is required.", 400, [{ field: "endpoint", code: "REQUIRED" }]);

    // Verify skill ownership and editability
    const skillRows = await prisma.$queryRawUnsafe<{ id: number; status: string }[]>(
        `SELECT id, status FROM "Skill" WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        skillId, publisherId,
    );
    if (skillRows.length === 0) return pubError("NOT_FOUND", "Skill not found.", 404);
    if (!["draft", "rejected"].includes(skillRows[0].status)) {
        return pubError("SKILL_LOCKED", "Providers can only be added to draft or rejected skills.", 403);
    }

    // Max 5 providers per skill
    const countRows = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
        `SELECT COUNT(*)::int AS cnt FROM "Provider" WHERE "skillId" = $1 AND "isActive" = true`, skillId,
    );
    if ((countRows[0]?.cnt ?? 0) >= 5) {
        return pubError("PROVIDER_LIMIT_REACHED", "Maximum of 5 providers per skill.", 429);
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

    // providerSecret required for third-party providers
    if (!providerSecret) {
        return pubError("VALIDATION_FAILED", "providerSecret is required for third-party providers.", 400, [
            { field: "providerSecret", code: "REQUIRED", detail: "Generate a strong secret (min 32 chars) on your server and configure it here." },
        ]);
    }
    if (typeof providerSecret !== "string" || providerSecret.length < 32) {
        return pubError("VALIDATION_FAILED", "providerSecret must be at least 32 characters.", 400, [
            { field: "providerSecret", code: "SECRET_TOO_SHORT", detail: "Minimum 32 characters. Use a cryptographically random value." },
        ]);
    }

    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "Provider" ("skillId", name, endpoint, "providerSecret", "pricePerCall", "costPerChar", "avgLatencyMs", "retryRate", "timeoutRate", "isActive", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 500, 0, 0, true, NOW())
         RETURNING id`,
        skillId, name, endpoint, providerSecret,
        pricePerCall ?? 0,
        costPerChar ?? null,
    );

    return NextResponse.json({ success: true, id: rows[0].id }, { status: 201 });
}
