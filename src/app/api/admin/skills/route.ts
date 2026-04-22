/**
 * Admin Skills API
 * GET    /api/admin/skills          — list all skills with provider count + call count
 * POST   /api/admin/skills          — create skill (generates embedding)
 * PATCH  /api/admin/skills?id=N     — update skill (name/description/tags/isActive/paramsSchema)
 * DELETE /api/admin/skills?id=N     — deactivate skill (sets isActive=false)
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embeddings";

export const dynamic = "force-dynamic";

async function checkAdmin() {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
}

export async function GET() {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const skills = await prisma.$queryRawUnsafe<{
        id: number;
        name: string;
        description: string;
        params_schema: string | null;
        tags: string | null;
        is_active: boolean;
        created_at: string;
        provider_count: number;
        call_count: number;
    }[]>(
        `SELECT
            s.id,
            s.name,
            s.description,
            s."paramsSchema" AS params_schema,
            s.tags,
            s."isActive"    AS is_active,
            s."createdAt"   AS created_at,
            (SELECT COUNT(*) FROM "Provider" p WHERE p."skillId" = s.id AND p."isActive" = true) AS provider_count,
            (SELECT COUNT(*) FROM "SkillCall" c WHERE c."skillId" = s.id) AS call_count
         FROM "Skill" s
         ORDER BY s."createdAt" DESC`
    );

    return NextResponse.json({ skills });
}

export async function POST(req: NextRequest) {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const body = await req.json();
    const { name, description, paramsSchema, tags } = body;

    if (!name || !description) {
        return NextResponse.json({ error: "name and description are required" }, { status: 400 });
    }

    const embedding = await embedQuery(`${name}: ${description}`);
    const vectorLiteral = `[${embedding.join(",")}]`;

    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "Skill" (name, description, embedding, "paramsSchema", tags, "isActive", "createdAt")
         VALUES ($1, $2, $3::vector, $4, $5, true, NOW())
         RETURNING id`,
        name,
        description,
        vectorLiteral,
        paramsSchema ? JSON.stringify(paramsSchema) : null,
        tags ? JSON.stringify(tags) : null,
    );

    return NextResponse.json({ success: true, id: rows[0].id });
}

export async function PATCH(req: NextRequest) {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await req.json();
    const updates: string[] = [];
    const args: unknown[] = [];
    let paramIdx = 1;

    if ("name" in body) { updates.push(`name = $${paramIdx++}`); args.push(body.name); }
    if ("description" in body) { updates.push(`description = $${paramIdx++}`); args.push(body.description); }
    if ("paramsSchema" in body) { updates.push(`"paramsSchema" = $${paramIdx++}`); args.push(body.paramsSchema ? JSON.stringify(body.paramsSchema) : null); }
    if ("tags" in body) { updates.push(`tags = $${paramIdx++}`); args.push(body.tags ? JSON.stringify(body.tags) : null); }
    if ("isActive" in body) { updates.push(`"isActive" = $${paramIdx++}`); args.push(Boolean(body.isActive)); }

    // Regenerate embedding if name or description changed
    if ("name" in body || "description" in body) {
        const current = await prisma.$queryRawUnsafe<{ name: string; description: string }[]>(
            `SELECT name, description FROM "Skill" WHERE id = $1`, id
        );
        if (current.length) {
            const newName = ("name" in body ? body.name : current[0].name) as string;
            const newDesc = ("description" in body ? body.description : current[0].description) as string;
            const embedding = await embedQuery(`${newName}: ${newDesc}`);
            updates.push(`embedding = $${paramIdx++}::vector`);
            args.push(`[${embedding.join(",")}]`);
        }
    }

    if (updates.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    args.push(id);
    await prisma.$executeRawUnsafe(
        `UPDATE "Skill" SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
        ...args
    );

    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await prisma.$executeRawUnsafe(`UPDATE "Skill" SET "isActive" = false WHERE id = $1`, id);
    return NextResponse.json({ success: true });
}
