/**
 * Skill taxonomy constants + LLM-powered auto-classification.
 *
 * At publish time, we call our own LLM gateway to assign:
 *   category     — controlled 2-level taxonomy ("media/image")
 *   capabilities — controlled verb list (["generate", "transform"])
 *   inputTypes   — what the skill accepts (["text", "url"])
 *   outputTypes  — what the skill returns (["image"])
 *
 * Publishers describe their skill in natural language.
 * We handle all taxonomy mapping — they never see these fields.
 */

// ── Controlled vocabulary ────────────────────────────────────────────────────

export const CATEGORIES = [
    "search/web",
    "search/academic",
    "search/code",
    "media/image",
    "media/audio",
    "media/video",
    "llm/chat",
    "llm/vision",
    "llm/embedding",
    "communication/sms",
    "communication/email",
    "communication/push",
    "data/scrape",
    "data/extract",
    "data/transform",
    "payments",
    "files/storage",
    "maps/geocoding",
] as const;

export const CAPABILITIES = [
    "generate",
    "search",
    "transcribe",
    "translate",
    "summarize",
    "classify",
    "send",
    "analyze",
    "convert",
    "extract",
    "store",
    "stream",
    "verify",
    "embed",
] as const;

export const IO_TYPES = [
    "text",
    "image",
    "audio",
    "url",
    "json",
    "binary",
] as const;

export type Category = typeof CATEGORIES[number];
export type Capability = typeof CAPABILITIES[number];
export type IOType = typeof IO_TYPES[number];

export interface SkillClassification {
    category: string;
    capabilities: string[];
    inputTypes: string[];
    outputTypes: string[];
}

// ── LLM classification ───────────────────────────────────────────────────────

export async function classifySkill(
    name: string,
    description: string,
    paramsSchema?: unknown,
): Promise<SkillClassification> {
    const baseUrl = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
    const apiKey = process.env.NEWAPI_ADMIN_KEY;
    if (!apiKey) throw new Error("NEWAPI_ADMIN_KEY not set");

    const prompt = `You are classifying API skills for an AI skill network. Given a skill, return ONLY a JSON object with these fields.

Skill name: ${name}
Skill description: ${description}
${paramsSchema ? `Params schema: ${JSON.stringify(paramsSchema)}` : ""}

Return JSON with exactly these keys:
- "category": one of ${JSON.stringify(CATEGORIES)}
- "capabilities": array of 1-3 items from ${JSON.stringify(CAPABILITIES)}
- "inputTypes": array of items from ${JSON.stringify(IO_TYPES)}
- "outputTypes": array of items from ${JSON.stringify(IO_TYPES)}

Rules:
- category: pick the single most specific match
- capabilities: verbs describing what this skill DOES (not what it is)
- inputTypes: what the caller must PROVIDE
- outputTypes: what the skill RETURNS

Return ONLY the JSON object, no explanation.`;

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
            max_tokens: 200,
        }),
    });

    if (!res.ok) {
        throw new Error(`Classification LLM error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? "{}";

    // Strip markdown code fences if model wraps in ```json ... ```
    const cleaned = content.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();

    let parsed: Partial<SkillClassification>;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        // Fallback: return safe defaults rather than failing the publish
        console.error("[classifySkill] failed to parse LLM response:", content);
        return { category: "llm/chat", capabilities: ["generate"], inputTypes: ["text"], outputTypes: ["text"] };
    }

    return {
        category: CATEGORIES.includes(parsed.category as Category)
            ? parsed.category!
            : "llm/chat",
        capabilities: (parsed.capabilities ?? []).filter(c => CAPABILITIES.includes(c as Capability)),
        inputTypes: (parsed.inputTypes ?? ["text"]).filter(t => IO_TYPES.includes(t as IOType)),
        outputTypes: (parsed.outputTypes ?? ["text"]).filter(t => IO_TYPES.includes(t as IOType)),
    };
}

// ── Enriched embedding text ───────────────────────────────────────────────────

/**
 * Build the text we embed for a skill.
 * Including structured metadata improves cosine similarity accuracy —
 * the vector captures category + capability signal, not just description prose.
 */
export function buildEmbedText(
    name: string,
    description: string,
    classification?: Partial<SkillClassification>,
): string {
    const parts: string[] = [];
    if (classification?.category) parts.push(`category:${classification.category}`);
    if (classification?.capabilities?.length) parts.push(`capabilities:${classification.capabilities.join(",")}`);
    if (classification?.inputTypes?.length) parts.push(`input:${classification.inputTypes.join(",")}`);
    if (classification?.outputTypes?.length) parts.push(`output:${classification.outputTypes.join(",")}`);
    parts.push(`${name}: ${description}`);
    return parts.join(" ");
}
