import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embeddings";
import { classifySkill, buildEmbedText } from "@/lib/classify";

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

    const classification = await classifySkill(name, description, paramsSchema);
    const embedText = buildEmbedText(name, description, classification);
    const embedding = await embedQuery(embedText);
    const vectorLiteral = `[${embedding.join(",")}]`;

    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "Skill" (name, description, embedding, "paramsSchema", tags, category, capabilities, "inputTypes", "outputTypes", "isActive", "createdAt")
         VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8, $9, true, NOW())
         RETURNING id`,
        name,
        description,
        vectorLiteral,
        paramsSchema ? JSON.stringify(paramsSchema) : null,
        tags ? JSON.stringify(tags) : null,
        classification.category,
        JSON.stringify(classification.capabilities),
        JSON.stringify(classification.inputTypes),
        JSON.stringify(classification.outputTypes),
    );

    return NextResponse.json({ success: true, id: rows[0].id, classification });
}
