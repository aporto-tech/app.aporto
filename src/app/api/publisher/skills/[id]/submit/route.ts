/**
 * POST /api/publisher/skills/[id]/submit
 * Move a draft (or edited-after-rejection) skill to pending_review.
 * Validates all submission requirements before transitioning.
 */
import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError, pubError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";
import { validateEndpointUrl } from "@/lib/ssrfGuard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { id } = await params;
    const skillId = Number(id);
    if (!skillId) return pubError("INVALID_ID", "Invalid skill id.", 400);

    // Fetch skill
    const skillRows = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string; status: string; params_schema: string | null;
        last_edited_at: string | null;
    }[]>(
        `SELECT id, name, description, status, "paramsSchema" AS params_schema, "lastEditedAt" AS last_edited_at
         FROM "Skill" WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        skillId, publisherId,
    );
    if (skillRows.length === 0) return pubError("NOT_FOUND", "Skill not found.", 404);
    const skill = skillRows[0];

    if (skill.status !== "draft" && skill.status !== "rejected") {
        return pubError("INVALID_STATUS", `Cannot submit a skill with status '${skill.status}'.`, 400);
    }

    // Re-submission after rejection requires at least one edit
    if (skill.status === "rejected" && !skill.last_edited_at) {
        return pubError("NO_EDITS_AFTER_REJECTION", "You must edit the skill before resubmitting after rejection.", 400);
    }

    // Check pending submission cap (max 10 per publisher)
    const pendingRows = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
        `SELECT COUNT(*)::int AS cnt FROM "Skill" WHERE "publisherId" = $1 AND status = 'pending_review'`,
        publisherId,
    );
    if ((pendingRows[0]?.cnt ?? 0) >= 10) {
        return pubError("SUBMISSION_LIMIT_REACHED", "Maximum of 10 concurrent pending review submissions.", 429, [
            { field: "status", code: "SUBMISSION_LIMIT_REACHED", detail: "Wait for admin review on existing submissions before submitting more." },
        ]);
    }

    // Validate submission requirements
    const violations: Array<{ field: string; code: string; detail?: string }> = [];

    if (!skill.description || skill.description.length < 50) {
        violations.push({ field: "description", code: "TOO_SHORT", detail: `Minimum 50 characters. Current: ${skill.description?.length ?? 0}` });
    }

    // paramsSchema must be valid JSON if present
    if (skill.params_schema) {
        try { JSON.parse(skill.params_schema); }
        catch { violations.push({ field: "paramsSchema", code: "INVALID_JSON", detail: "paramsSchema must be valid JSON." }); }
    }

    // Must have at least one active provider with HTTPS endpoint and providerSecret
    const providers = await prisma.$queryRawUnsafe<{
        id: number; endpoint: string; provider_secret: string | null;
        price_per_call: number; cost_per_char: number | null;
    }[]>(
        `SELECT id, endpoint, "providerSecret" AS provider_secret,
                "pricePerCall" AS price_per_call, "costPerChar" AS cost_per_char
         FROM "Provider" WHERE "skillId" = $1 AND "isActive" = true`,
        skillId,
    );

    if (providers.length === 0) {
        violations.push({ field: "providers", code: "NO_PROVIDERS", detail: "At least one active provider is required." });
    } else {
        for (const p of providers) {
            if (!p.provider_secret) {
                violations.push({ field: "providers", code: "MISSING_PROVIDER_SECRET", detail: `Provider id=${p.id} is missing a providerSecret. Required for third-party providers.` });
            }
            if (!p.endpoint.startsWith("https://")) {
                violations.push({ field: "providers", code: "ENDPOINT_NOT_HTTPS", detail: `Provider id=${p.id} endpoint must be HTTPS.` });
            } else {
                const ssrf = await validateEndpointUrl(p.endpoint);
                if (!ssrf.ok) {
                    violations.push({ field: "providers", code: "SSRF_BLOCKED", detail: `Provider id=${p.id}: ${ssrf.error}` });
                }
            }
            const hasPrice = (p.price_per_call != null && p.price_per_call > 0) || p.cost_per_char != null;
            if (!hasPrice) {
                violations.push({ field: "providers", code: "NO_PRICING", detail: `Provider id=${p.id} must have pricePerCall > 0 or costPerChar set.` });
            }
        }
    }

    if (violations.length > 0) {
        return pubError("VALIDATION_FAILED", "Skill does not meet submission requirements.", 400, violations);
    }

    await prisma.$executeRawUnsafe(
        `UPDATE "Skill" SET status = 'pending_review' WHERE id = $1`,
        skillId,
    );

    return NextResponse.json({ success: true, status: "pending_review" });
}
