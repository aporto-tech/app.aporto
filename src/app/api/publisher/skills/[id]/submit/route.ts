/**
 * POST /api/publisher/skills/[id]/submit
 * Move a draft (or edited-after-rejection) submission to pending.
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
    const submissionId = Number(id);
    if (!submissionId) return pubError("INVALID_ID", "Invalid submission id.", 400);

    // Fetch submission
    const rows = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string; status: string;
        params_schema: string | null; last_edited_at: string | null;
    }[]>(
        `SELECT id, name, description, status, "paramsSchema" AS params_schema, "lastEditedAt" AS last_edited_at
         FROM "SkillSubmission" WHERE id = $1 AND "publisherId" = $2 LIMIT 1`,
        submissionId, publisherId,
    );
    if (rows.length === 0) return pubError("NOT_FOUND", "Submission not found.", 404);
    const submission = rows[0];

    if (submission.status !== "draft" && submission.status !== "rejected") {
        return pubError("INVALID_STATUS", `Cannot submit with status '${submission.status}'.`, 400);
    }

    // Re-submission after rejection requires at least one edit
    if (submission.status === "rejected" && !submission.last_edited_at) {
        return pubError("NO_EDITS_AFTER_REJECTION", "You must edit the submission before resubmitting after rejection.", 400);
    }

    // Check pending submission cap (max 10 per publisher)
    const pendingRows = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
        `SELECT COUNT(*)::int AS cnt FROM "SkillSubmission" WHERE "publisherId" = $1 AND status = 'pending'`,
        publisherId,
    );
    if ((pendingRows[0]?.cnt ?? 0) >= 10) {
        return pubError("SUBMISSION_LIMIT_REACHED", "Maximum of 10 concurrent pending submissions.", 429, [
            { field: "status", code: "SUBMISSION_LIMIT_REACHED", detail: "Wait for admin review on existing submissions before submitting more." },
        ]);
    }

    // Validate submission requirements
    const violations: Array<{ field: string; code: string; detail?: string }> = [];

    if (!submission.description || submission.description.length < 50) {
        violations.push({ field: "description", code: "TOO_SHORT", detail: `Minimum 50 characters. Current: ${submission.description?.length ?? 0}` });
    }

    if (submission.params_schema) {
        try { JSON.parse(submission.params_schema); }
        catch { violations.push({ field: "paramsSchema", code: "INVALID_JSON", detail: "paramsSchema must be valid JSON." }); }
    }

    // Must have at least one provider with HTTPS endpoint and providerSecret
    const providers = await prisma.$queryRawUnsafe<{
        id: number; endpoint: string; provider_secret: string | null;
        price_per_call: number; cost_per_char: number | null;
    }[]>(
        `SELECT id, endpoint, "providerSecret" AS provider_secret,
                "pricePerCall" AS price_per_call, "costPerChar" AS cost_per_char
         FROM "SubmissionProvider" WHERE "submissionId" = $1`,
        submissionId,
    );

    if (providers.length === 0) {
        violations.push({ field: "providers", code: "NO_PROVIDERS", detail: "At least one provider is required." });
    } else {
        for (const p of providers) {
            if (!p.provider_secret || p.provider_secret.length < 32) {
                violations.push({ field: "providers", code: "MISSING_PROVIDER_SECRET", detail: `Provider id=${p.id} needs providerSecret (min 32 chars).` });
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
        return pubError("VALIDATION_FAILED", "Submission does not meet requirements.", 400, violations);
    }

    await prisma.$executeRawUnsafe(
        `UPDATE "SkillSubmission" SET status = 'pending' WHERE id = $1`,
        submissionId,
    );

    return NextResponse.json({ success: true, status: "pending" });
}
