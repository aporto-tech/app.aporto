/**
 * PATCH /api/publisher/providers/[id]  — update provider (draft/rejected skills only)
 * DELETE /api/publisher/providers/[id] — remove provider (draft/rejected skills only)
 */
import { NextRequest, NextResponse } from "next/server";
import { validatePublisherKey } from "@/lib/publisherAuth";
import { pubAuthError, pubError } from "@/lib/pubErrors";
import { prisma } from "@/lib/prisma";
import { validateEndpointUrl } from "@/lib/ssrfGuard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function getOwnedProvider(publisherId: string, providerId: number) {
    const rows = await prisma.$queryRawUnsafe<{
        id: number; skill_id: number; skill_status: string;
    }[]>(
        `SELECT p.id, p."skillId" AS skill_id, s.status AS skill_status
         FROM "Provider" p
         JOIN "Skill" s ON s.id = p."skillId"
         WHERE p.id = $1 AND s."publisherId" = $2
         LIMIT 1`,
        providerId, publisherId,
    );
    return rows[0] ?? null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { id } = await params;
    const providerId = Number(id);
    if (!providerId) return pubError("INVALID_ID", "Invalid provider id.", 400);

    const provider = await getOwnedProvider(publisherId, providerId);
    if (!provider) return pubError("NOT_FOUND", "Provider not found.", 404);

    if (!["draft", "rejected"].includes(provider.skill_status)) {
        return pubError("SKILL_LOCKED", `Cannot edit provider for a skill with status '${provider.skill_status}'.`, 403);
    }

    const body = await req.json();
    const updates: string[] = [];
    const args: unknown[] = [];
    let i = 1;

    if ("name" in body) { updates.push(`name = $${i++}`); args.push(body.name); }

    if ("endpoint" in body) {
        if (!body.endpoint.startsWith("https://")) {
            return pubError("VALIDATION_FAILED", "Only HTTPS endpoints are allowed.", 400);
        }
        const ssrf = await validateEndpointUrl(body.endpoint);
        if (!ssrf.ok) return pubError("VALIDATION_FAILED", ssrf.error!, 400);
        updates.push(`endpoint = $${i++}`); args.push(body.endpoint);
    }

    if ("providerSecret" in body) {
        if (body.providerSecret === null || body.providerSecret === "") {
            return pubError("VALIDATION_FAILED", "providerSecret cannot be removed from a third-party provider.", 400, [
                { field: "providerSecret", code: "CANNOT_CLEAR", detail: "Third-party providers require a providerSecret." },
            ]);
        }
        if (typeof body.providerSecret === "string" && body.providerSecret.length < 32) {
            return pubError("VALIDATION_FAILED", "providerSecret must be at least 32 characters.", 400, [
                { field: "providerSecret", code: "SECRET_TOO_SHORT" },
            ]);
        }
        updates.push(`"providerSecret" = $${i++}`); args.push(body.providerSecret);
    }

    if ("pricePerCall" in body) { updates.push(`"pricePerCall" = $${i++}`); args.push(body.pricePerCall); }
    if ("costPerChar" in body) { updates.push(`"costPerChar" = $${i++}`); args.push(body.costPerChar); }

    if (updates.length === 0) return pubError("NO_CHANGES", "No fields to update.", 400);

    args.push(providerId);
    await prisma.$executeRawUnsafe(`UPDATE "Provider" SET ${updates.join(", ")} WHERE id = $${i}`, ...args);

    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const authResult = await validatePublisherKey(req);
    if (!authResult.ok || !authResult.auth) return pubAuthError(authResult.errorCode, authResult.message);
    const { publisherId } = authResult.auth;

    const { id } = await params;
    const providerId = Number(id);
    if (!providerId) return pubError("INVALID_ID", "Invalid provider id.", 400);

    const provider = await getOwnedProvider(publisherId, providerId);
    if (!provider) return pubError("NOT_FOUND", "Provider not found.", 404);

    if (!["draft", "rejected"].includes(provider.skill_status)) {
        return pubError("SKILL_LOCKED", `Cannot remove provider for a skill with status '${provider.skill_status}'.`, 403);
    }

    await prisma.$executeRawUnsafe(`UPDATE "Provider" SET "isActive" = false WHERE id = $1`, providerId);

    return NextResponse.json({ success: true });
}
