/**
 * POST /api/skills/publish — admin-only: create a skill with an auto-generated embedding.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embeddings";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, description, paramsSchema, tags } = body;

    if (!name || !description) {
        return NextResponse.json({ error: "name and description are required" }, { status: 400 });
    }

    // Generate embedding from name + description
    const embeddingInput = `${name}: ${description}`;
    const embedding = await embedQuery(embeddingInput);
    const vectorLiteral = `[${embedding.join(",")}]`;

    // Insert skill with embedding (raw SQL — Prisma can't handle vector type)
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
