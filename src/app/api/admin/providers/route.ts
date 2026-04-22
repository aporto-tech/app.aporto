/**
 * Admin Providers API
 * GET    /api/admin/providers?skillId=N   — list providers for a skill
 * POST   /api/admin/providers             — create provider
 * PATCH  /api/admin/providers?id=N        — update provider
 * DELETE /api/admin/providers?id=N        — deactivate provider
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function checkAdmin() {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
}

export async function GET(req: NextRequest) {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(req.url);
    const skillId = Number(searchParams.get("skillId"));
    if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });

    const providers = await prisma.provider.findMany({
        where: { skillId },
        orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ providers });
}

export async function POST(req: NextRequest) {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const body = await req.json();
    const { skillId, name, endpoint, pricePerCall } = body;

    if (!skillId || !name || !endpoint || pricePerCall === undefined) {
        return NextResponse.json({ error: "skillId, name, endpoint, and pricePerCall are required" }, { status: 400 });
    }

    // Validate HTTPS
    try {
        const url = new URL(endpoint);
        if (url.protocol !== "https:") {
            return NextResponse.json({ error: "endpoint must use HTTPS" }, { status: 400 });
        }
    } catch {
        return NextResponse.json({ error: "endpoint must be a valid URL" }, { status: 400 });
    }

    const provider = await prisma.provider.create({
        data: {
            skillId: Number(skillId),
            name,
            endpoint,
            pricePerCall: Number(pricePerCall),
            avgLatencyMs: body.avgLatencyMs ? Number(body.avgLatencyMs) : 500,
            retryRate: body.retryRate ? Number(body.retryRate) : 0,
            providerSecret: body.providerSecret ? String(body.providerSecret) : null,
            isActive: body.isActive !== false,
        },
    });

    return NextResponse.json({ success: true, id: provider.id });
}

export async function PATCH(req: NextRequest) {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await req.json();

    if ("endpoint" in body && body.endpoint) {
        try {
            const url = new URL(body.endpoint);
            if (url.protocol !== "https:") {
                return NextResponse.json({ error: "endpoint must use HTTPS" }, { status: 400 });
            }
        } catch {
            return NextResponse.json({ error: "endpoint must be a valid URL" }, { status: 400 });
        }
    }

    const data: Record<string, unknown> = {};
    if ("name" in body) data.name = body.name;
    if ("endpoint" in body) data.endpoint = body.endpoint;
    if ("pricePerCall" in body) data.pricePerCall = Number(body.pricePerCall);
    if ("avgLatencyMs" in body) data.avgLatencyMs = Number(body.avgLatencyMs);
    if ("retryRate" in body) data.retryRate = Number(body.retryRate);
    if ("isActive" in body) data.isActive = Boolean(body.isActive);
    // Allow clearing providerSecret by passing null or "" explicitly
    if ("providerSecret" in body) data.providerSecret = body.providerSecret ? String(body.providerSecret) : null;

    if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    await prisma.provider.update({ where: { id }, data });
    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await prisma.provider.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
}
