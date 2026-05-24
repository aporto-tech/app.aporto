import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

const PRICING_CACHE_SECONDS = 7 * 24 * 60 * 60;

type SkillPricingRow = {
    skill_id: number;
    skill_name: string;
    description: string;
    category: string | null;
    capabilities: string | null;
    tags: string | null;
    provider_id: number;
    price_per_call: number;
    cost_per_char: number | null;
    sync_config: string | null;
};

type ProviderPrice = {
    amount: number;
    unit: "call" | "1K chars" | "1M input tokens" | "1M output tokens";
    label: string;
};

function parseStringArray(value: string | null): string[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.map((item) => String(item)).filter(Boolean)
            : [];
    } catch {
        return [];
    }
}

function parseSyncConfig(value: string | null): Record<string, unknown> | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

function numberValue(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function priceForProvider(row: SkillPricingRow): ProviderPrice | null {
    const config = parseSyncConfig(row.sync_config);
    const pricing = config?.pricing;
    if (pricing && typeof pricing === "object" && !Array.isArray(pricing)) {
        const inputUsd = numberValue((pricing as Record<string, unknown>).inputUsdPerMillionTokens);
        const outputUsd = numberValue((pricing as Record<string, unknown>).outputUsdPerMillionTokens);
        if (inputUsd != null || outputUsd != null) {
            const amount = inputUsd ?? outputUsd ?? 0;
            const outputPart = outputUsd != null ? `, $${formatPrice(outputUsd)} / 1M output tokens` : "";
            const unitLabel = inputUsd != null ? "1M input tokens" : "1M output tokens";
            const unit = inputUsd != null ? "1M input tokens" : "1M output tokens";
            return {
                amount,
                unit,
                label: `from $${formatPrice(amount)} / ${unitLabel}${inputUsd != null ? outputPart : ""}`,
            };
        }
    }

    const costPerChar = numberValue(row.cost_per_char);
    if (costPerChar != null) {
        const perThousandChars = costPerChar * 1000;
        return {
            amount: perThousandChars,
            unit: "1K chars",
            label: `from $${formatPrice(perThousandChars)} / 1K chars`,
        };
    }

    const pricePerCall = numberValue(row.price_per_call);
    if (pricePerCall != null) {
        return {
            amount: pricePerCall,
            unit: "call",
            label: `from $${formatPrice(pricePerCall)} / call`,
        };
    }

    return null;
}

function formatPrice(value: number): string {
    if (value >= 1) return value.toFixed(2);
    if (value >= 0.01) return value.toFixed(4);
    return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function cheaperPrice(a: ProviderPrice | null, b: ProviderPrice | null): ProviderPrice | null {
    if (!a) return b;
    if (!b) return a;
    if (a.unit !== b.unit) return a;
    return b.amount < a.amount ? b : a;
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": `public, s-maxage=${PRICING_CACHE_SECONDS}, stale-while-revalidate=${PRICING_CACHE_SECONDS}`,
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

const getCachedSkillPricing = unstable_cache(async () => {
    const rows = await prisma.$queryRawUnsafe<SkillPricingRow[]>(
        `SELECT
            s.id AS skill_id,
            s.name AS skill_name,
            s.description,
            s.category,
            s.capabilities,
            s.tags,
            p.id AS provider_id,
            p."pricePerCall" AS price_per_call,
            p."costPerChar" AS cost_per_char,
            p."syncConfig" AS sync_config
         FROM "Skill" s
         JOIN "Provider" p ON p."skillId" = s.id AND p."isActive" = true
         WHERE s."isActive" = true
           AND s.status = 'live'
         ORDER BY s.name ASC, p."pricePerCall" ASC`,
    );

    const skills = new Map<number, {
        skillId: number;
        name: string;
        description: string;
        category: string | null;
        capabilities: string[];
        tags: string[];
        providerCount: number;
        price: ProviderPrice | null;
    }>();

    for (const row of rows) {
        const existing = skills.get(row.skill_id);
        const nextPrice = priceForProvider(row);
        if (!existing) {
            skills.set(row.skill_id, {
                skillId: row.skill_id,
                name: row.skill_name,
                description: row.description,
                category: row.category,
                capabilities: parseStringArray(row.capabilities),
                tags: parseStringArray(row.tags),
                providerCount: 1,
                price: nextPrice,
            });
            continue;
        }
        existing.providerCount += 1;
        existing.price = cheaperPrice(existing.price, nextPrice);
    }

    const items = Array.from(skills.values()).map((skill) => ({
        skillId: skill.skillId,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        capabilities: skill.capabilities,
        tags: skill.tags,
        providerCount: skill.providerCount,
        priceLabel: skill.price?.label ?? "Contact sales",
        priceAmount: skill.price?.amount ?? null,
        priceUnit: skill.price?.unit ?? null,
    }));

    return {
        success: true,
        updatedAt: new Date().toISOString(),
        count: items.length,
        skills: items,
    };
}, ["skill-pricing-v1"], { revalidate: PRICING_CACHE_SECONDS });

export async function GET() {
    const data = await getCachedSkillPricing();
    return NextResponse.json(
        data,
        { headers: corsHeaders() },
    );
}
