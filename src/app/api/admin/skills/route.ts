import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embeddings";
import { classifySkill, buildEmbedText } from "@/lib/classify";

export const dynamic = "force-dynamic";

async function checkAdmin() {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        category: string | null;
        capabilities: string | null;
        input_types: string | null;
        output_types: string | null;
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
            s.category,
            s.capabilities,
            s."inputTypes"  AS input_types,
            s."outputTypes" AS output_types,
            s."isActive"    AS is_active,
            s."createdAt"   AS created_at,
            (SELECT COUNT(*)::int FROM "Provider" p WHERE p."skillId" = s.id AND p."isActive" = true) AS provider_count,
            (SELECT COUNT(*)::int FROM "SkillCall" c WHERE c."skillId" = s.id) AS call_count
         FROM "Skill" s
         ORDER BY s."createdAt" DESC`
    );

    return NextResponse.json({ skills });
}

export async function POST(req: NextRequest) {
    const forbidden = await checkAdmin();
    if (forbidden) return forbidden;

    const body = await req.json();
    const { name, description, paramsSchema, tags, providers } = body;

    if (!name || !description) {
        return NextResponse.json({ error: "name and description are required" }, { status: 400 });
    }

    const classification = await classifySkill(name, description, paramsSchema);
    const embedText = buildEmbedText(name, description, classification);
    const embedding = await embedQuery(embedText);
    const vectorLiteral = `[${embedding.join(",")}]`;

    // If providers are included (from assistant draft), wrap in transaction
    if (providers && Array.isArray(providers) && providers.length > 0) {
        const result = await prisma.$transaction(async (tx) => {
            const skillRows = await tx.$queryRawUnsafe<{ id: number }[]>(
                `INSERT INTO "Skill" (name, description, embedding, "paramsSchema", tags, category, capabilities, "inputTypes", "outputTypes", "isActive", status, "createdAt")
                 VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8, $9, true, 'live', NOW())
                 RETURNING id`,
                name, description, vectorLiteral,
                paramsSchema ? JSON.stringify(paramsSchema) : null,
                tags ? JSON.stringify(tags) : null,
                classification.category,
                JSON.stringify(classification.capabilities),
                JSON.stringify(classification.inputTypes),
                JSON.stringify(classification.outputTypes),
            );
            const skillId = skillRows[0].id;

            // Create providers
            for (const prov of providers) {
                if (!prov.name || !prov.endpoint) continue;
                await tx.$executeRawUnsafe(
                    `INSERT INTO "Provider" ("skillId", name, endpoint, "pricePerCall", "avgLatencyMs", "retryRate", "isActive", "providerSecret", "createdAt")
                     VALUES ($1, $2, $3, $4, 500, 0, true, $5, NOW())`,
                    skillId,
                    prov.name,
                    prov.endpoint,
                    prov.pricePerCall ?? 0.01,
                    prov.providerSecret ?? null,
                );
            }

            return skillId;
        });

        console.log(`[admin] Skill ${result} created with ${providers.length} provider(s) via AI assistant`);
        return NextResponse.json({ success: true, id: result, classification, providersCreated: providers.length });
    }

    // Original flow: skill only, no providers
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "Skill" (name, description, embedding, "paramsSchema", tags, category, capabilities, "inputTypes", "outputTypes", "isActive", "createdAt")
         VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8, $9, true, NOW())
         RETURNING id`,
        name, description, vectorLiteral,
        paramsSchema ? JSON.stringify(paramsSchema) : null,
        tags ? JSON.stringify(tags) : null,
        classification.category,
        JSON.stringify(classification.capabilities),
        JSON.stringify(classification.inputTypes),
        JSON.stringify(classification.outputTypes),
    );

    return NextResponse.json({ success: true, id: rows[0].id, classification });
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
    let i = 1;

    if ("name" in body) { updates.push(`name = $${i++}`); args.push(body.name); }
    if ("description" in body) { updates.push(`description = $${i++}`); args.push(body.description); }
    if ("paramsSchema" in body) { updates.push(`"paramsSchema" = $${i++}`); args.push(body.paramsSchema ? JSON.stringify(body.paramsSchema) : null); }
    if ("tags" in body) { updates.push(`tags = $${i++}`); args.push(body.tags ? JSON.stringify(body.tags) : null); }
    if ("isActive" in body) { updates.push(`"isActive" = $${i++}`); args.push(Boolean(body.isActive)); }
    if ("category" in body) { updates.push(`category = $${i++}`); args.push(body.category); }
    if ("capabilities" in body) { updates.push(`capabilities = $${i++}`); args.push(JSON.stringify(body.capabilities)); }
    if ("inputTypes" in body) { updates.push(`"inputTypes" = $${i++}`); args.push(JSON.stringify(body.inputTypes)); }
    if ("outputTypes" in body) { updates.push(`"outputTypes" = $${i++}`); args.push(JSON.stringify(body.outputTypes)); }

    if ("name" in body || "description" in body) {
        const current = await prisma.$queryRawUnsafe<{ name: string; description: string; category: string | null; capabilities: string | null; input_types: string | null; output_types: string | null }[]>(
            `SELECT name, description, category, capabilities, "inputTypes" AS input_types, "outputTypes" AS output_types FROM "Skill" WHERE id = $1`, id
        );
        if (current.length) {
            const newName = ("name" in body ? body.name : current[0].name) as string;
            const newDesc = ("description" in body ? body.description : current[0].description) as string;
            const classification = await classifySkill(newName, newDesc);
            const embedText = buildEmbedText(newName, newDesc, classification);
            const embedding = await embedQuery(embedText);
            updates.push(`embedding = $${i++}::vector`);
            args.push(`[${embedding.join(",")}]`);
            updates.push(`category = $${i++}`); args.push(classification.category);
            updates.push(`capabilities = $${i++}`); args.push(JSON.stringify(classification.capabilities));
            updates.push(`"inputTypes" = $${i++}`); args.push(JSON.stringify(classification.inputTypes));
            updates.push(`"outputTypes" = $${i++}`); args.push(JSON.stringify(classification.outputTypes));
        }
    }

    if (updates.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    args.push(id);
    await prisma.$executeRawUnsafe(`UPDATE "Skill" SET ${updates.join(", ")} WHERE id = $${i}`, ...args);
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
