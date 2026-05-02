/**
 * POST /api/admin/submissions/review?id=N
 * AI reviews a pending submission: checks duplicates, validates name/docs.
 * Returns recommendation: create_skill | add_provider | reject
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embeddings";
import { buildEmbedText, classifySkill } from "@/lib/classify";

export const dynamic = "force-dynamic";

const NEWAPI_BASE = process.env.NEWAPI_BASE_URL || "https://api.aporto.tech";
const NEWAPI_KEY = process.env.NEWAPI_ADMIN_KEY || process.env.NEWAPI_KEY || "";

interface AiRecommendation {
    action: "create_skill" | "add_provider" | "reject";
    reason: string;
    duplicateSkillId?: number;
    duplicateSkillName?: string;
    suggestedName?: string;
    suggestedCategory?: string;
    issues?: string[];
}

export async function POST(req: NextRequest) {
    if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Fetch submission + providers
    const subRows = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string; status: string;
        params_schema: string | null; category: string | null; tags: string | null;
        publisher_name: string; publisher_email: string;
    }[]>(
        `SELECT s.id, s.name, s.description, s.status, s."paramsSchema" AS params_schema,
                s.category, s.tags,
                p."displayName" AS publisher_name, u.email AS publisher_email
         FROM "SkillSubmission" s
         JOIN "Publisher" p ON p.id = s."publisherId"
         JOIN "User" u ON u.id = p."userId"
         WHERE s.id = $1`,
        id,
    );

    if (subRows.length === 0) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    const submission = subRows[0];

    if (submission.status !== "pending") {
        return NextResponse.json({ error: `Submission status is '${submission.status}', expected 'pending'.` }, { status: 400 });
    }

    // Fetch submission providers
    const providers = await prisma.$queryRawUnsafe<{
        name: string; endpoint: string; price_per_call: number;
    }[]>(
        `SELECT name, endpoint, "pricePerCall" AS price_per_call FROM "SubmissionProvider" WHERE "submissionId" = $1`,
        id,
    );

    // Mark as reviewing
    await prisma.$executeRawUnsafe(
        `UPDATE "SkillSubmission" SET status = 'reviewing' WHERE id = $1`, id,
    );

    // Find similar skills by embedding
    const classification = await classifySkill(submission.name, submission.description);
    const embedText = buildEmbedText(submission.name, submission.description, classification);
    const embedding = await embedQuery(embedText);
    const vectorLiteral = `[${embedding.join(",")}]`;

    const similar = await prisma.$queryRawUnsafe<{
        id: number; name: string; description: string; category: string | null; similarity: number;
    }[]>(
        `SELECT id, name, description, category,
                1 - (embedding <=> $1::vector) AS similarity
         FROM "Skill"
         WHERE "isActive" = true AND status = 'live' AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 5`,
        vectorLiteral,
    );

    // Filter to high-similarity matches
    const duplicateCandidates = similar.filter(s => s.similarity > 0.85);

    // Call LLM for review
    const systemPrompt = `You are Aporto's skill review AI. You analyze skill submissions for the Aporto API marketplace.

Your job is to:
1. Check if the submission duplicates an existing skill (similar name/description/capability)
2. Verify the name follows our convention: lowercase, descriptive, action-oriented
3. Check the description is clear and accurate
4. Recommend one action:
   - "create_skill": New unique skill, ready to be created
   - "add_provider": Duplicate detected — should add as provider to existing skill
   - "reject": Issues with documentation, name, or endpoint that publisher must fix

Respond ONLY with valid JSON matching this schema:
{
  "action": "create_skill" | "add_provider" | "reject",
  "reason": "explanation for admin",
  "duplicateSkillId": number | null,
  "duplicateSkillName": string | null,
  "suggestedName": string | null,
  "suggestedCategory": string | null,
  "issues": ["list of issues if reject"]
}`;

    const userPrompt = `## Submission
Name: ${submission.name}
Description: ${submission.description}
Category: ${submission.category ?? "none"}
Params: ${submission.params_schema ?? "none"}
Providers: ${providers.map(p => `${p.name} → ${p.endpoint} ($${p.price_per_call}/call)`).join(", ")}
Publisher: ${submission.publisher_name}

## Existing similar skills (by embedding similarity)
${duplicateCandidates.length === 0 ? "No highly similar skills found." :
    duplicateCandidates.map(s => `- [ID ${s.id}] "${s.name}" (similarity: ${(s.similarity * 100).toFixed(1)}%) — ${s.description.slice(0, 100)}`).join("\n")}

## All top-5 nearest skills (for context)
${similar.map(s => `- [ID ${s.id}] "${s.name}" (${(s.similarity * 100).toFixed(1)}%) — ${s.description.slice(0, 80)}`).join("\n")}`;

    let recommendation: AiRecommendation;

    try {
        const llmRes = await fetch(`${NEWAPI_BASE}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${NEWAPI_KEY}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.1,
                max_tokens: 500,
                response_format: { type: "json_object" },
            }),
        });

        const llmData = await llmRes.json();
        const content = llmData.choices?.[0]?.message?.content;
        recommendation = JSON.parse(content);
    } catch (e) {
        // Fallback: if LLM fails, check duplicates manually
        if (duplicateCandidates.length > 0) {
            recommendation = {
                action: "add_provider",
                reason: `High similarity (${(duplicateCandidates[0].similarity * 100).toFixed(0)}%) with existing skill "${duplicateCandidates[0].name}". LLM review failed, defaulting to duplicate detection.`,
                duplicateSkillId: duplicateCandidates[0].id,
                duplicateSkillName: duplicateCandidates[0].name,
            };
        } else {
            recommendation = {
                action: "create_skill",
                reason: "No duplicates detected. LLM review unavailable — manual check recommended.",
                suggestedCategory: classification.category,
            };
        }
    }

    // Save recommendation
    await prisma.$executeRawUnsafe(
        `UPDATE "SkillSubmission" SET "aiRecommendation" = $1 WHERE id = $2`,
        JSON.stringify(recommendation), id,
    );

    return NextResponse.json({
        success: true,
        submissionId: id,
        recommendation,
        similarSkills: similar.map(s => ({
            id: s.id, name: s.name, description: s.description.slice(0, 150),
            category: s.category, similarity: Math.round(s.similarity * 100),
        })),
    });
}
