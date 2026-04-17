import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Kingdom definitions: provider prefix → display info
const KINGDOMS: Record<string, { name: string; darkLord: string; order: number }> = {
    "openai":       { name: "The OpenAI Empire",           darkLord: "The Iron Codex",            order: 1 },
    "anthropic":    { name: "The Anthropic Realm",         darkLord: "The Whispering Syndicate",  order: 2 },
    "google":       { name: "The Google Dominion",         darkLord: "The Mirror Court",          order: 3 },
    "deepseek":     { name: "The DeepSeek Confederation",  darkLord: "The Recursive Void",        order: 4 },
    "qwen":         { name: "The Qwen Dominion",           darkLord: "The Jade Assembly",         order: 5 },
    "meta-llama":   { name: "The Meta Wildlands",          darkLord: "The Open Horde",            order: 6 },
    "mistralai":    { name: "The Mistral Provinces",       darkLord: "The Codex Compact",         order: 7 },
    "x-ai":         { name: "The xAI Frontier",            darkLord: "The Grok Collective",       order: 8 },
    "perplexity":   { name: "The Perplexity Seas",         darkLord: "The Sonar Fleet",           order: 9 },
    "amazon":       { name: "The Amazon Forests",          darkLord: "The Nova Council",          order: 10 },
}

function getKingdomId(modelName: string): string {
    const lower = modelName.toLowerCase()

    // Prefixed models — check exact prefix first
    if (lower.startsWith("anthropic/") || lower.startsWith("claude-"))          return "anthropic"
    if (lower.startsWith("google/") || lower.startsWith("gemini-"))              return "google"
    if (lower.startsWith("deepseek/") || lower.startsWith("deepseek-"))         return "deepseek"
    if (lower.startsWith("qwen/") || lower.startsWith("qwen-") || lower.startsWith("qwen2") || lower.startsWith("qwq-")) return "qwen"
    if (lower.startsWith("meta-llama/") || lower.startsWith("llama-") || lower.startsWith("llama3") || lower.startsWith("llama4")) return "meta-llama"
    if (lower.startsWith("mistralai/") || lower.startsWith("mistral-") || lower.startsWith("mixtral-") || lower.startsWith("codestral-") || lower.startsWith("pixtral-")) return "mistralai"
    if (lower.startsWith("x-ai/") || lower.startsWith("grok-"))                 return "x-ai"
    if (lower.startsWith("perplexity/") || lower.startsWith("sonar-"))          return "perplexity"
    if (lower.startsWith("amazon/") || lower.startsWith("nova-") || lower.startsWith("titan-")) return "amazon"

    // OpenAI models come without a provider prefix in OpenAI-compatible APIs
    if (lower.startsWith("gpt-") || lower.startsWith("o1") || lower.startsWith("o3") ||
        lower.startsWith("o4") || lower.startsWith("chatgpt-") || lower.startsWith("text-") ||
        lower.startsWith("davinci-") || lower.startsWith("curie-")) return "openai"

    // Unknown: extract prefix before "/" or use raw name
    if (modelName.includes("/")) return modelName.split("/")[0].toLowerCase()
    return "other"
}

export async function GET() {
    try {
        // 1. Current owners: try materialized view first, fall back to direct query
        let owners: Array<{ model_name: string; user_id: number; username: string; total_tokens: bigint | number }> = []
        try {
            owners = await prisma.$queryRawUnsafe<any[]>(`
                SELECT model_name, user_id, username, total_tokens
                FROM conquest_current_owners
                WHERE rank = 1
            `)
        } catch {
            // View not set up yet — query logs directly
            owners = await prisma.$queryRawUnsafe<any[]>(`
                WITH ranked AS (
                    SELECT
                        model_name,
                        user_id,
                        username,
                        SUM(prompt_tokens + completion_tokens) AS total_tokens,
                        ROW_NUMBER() OVER (
                            PARTITION BY model_name
                            ORDER BY SUM(prompt_tokens + completion_tokens) DESC,
                                     MIN(created_at) ASC
                        ) AS rank
                    FROM logs
                    WHERE type = 2
                      AND (content = '' OR content IS NULL)
                      AND created_at > EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours')
                    GROUP BY model_name, user_id, username
                )
                SELECT model_name, user_id, username, total_tokens
                FROM ranked
                WHERE rank = 1
            `)
        }

        // 2. Dark Lord seed data
        let seedOwners: Array<{ model_id: string; faction_name: string; faction_type: string; capturable: boolean }> = []
        try {
            seedOwners = await prisma.$queryRawUnsafe<any[]>(`
                SELECT model_id, faction_name, faction_type, capturable
                FROM conquest_seed_owners
            `)
        } catch {
            // Table not set up yet — will use kingdom-level Dark Lords as fallback
        }
        const seedMap = new Map(seedOwners.map(s => [s.model_id, s]))

        // 3. All active models from last 30 days (to know what provinces exist)
        const allModels = await prisma.$queryRawUnsafe<any[]>(`
            SELECT
                model_name,
                SUM(prompt_tokens + completion_tokens) AS total_tokens_30d,
                COUNT(*) AS request_count
            FROM logs
            WHERE type = 2
              AND (content = '' OR content IS NULL)
              AND created_at > EXTRACT(EPOCH FROM NOW() - INTERVAL '720 hours')
              AND model_name IS NOT NULL AND model_name != ''
            GROUP BY model_name
            ORDER BY total_tokens_30d DESC
            LIMIT 300
        `)

        const ownerMap = new Map(owners.map(o => [o.model_name, o]))

        // 4. Group provinces into kingdoms
        type OwnerType = "claimed" | "dark_lord" | "founding_keep" | "fog"
        interface Province {
            model_id: string
            display_name: string
            owner_type: OwnerType
            owner_name: string | null
            total_tokens_30d: number
        }
        interface Kingdom {
            id: string
            name: string
            dark_lord: string
            order: number
            provinces: Province[]
            claimed_count: number
            dark_lord_count: number
        }

        const kingdomMap: Record<string, Kingdom> = {}

        for (const model of allModels) {
            const modelName = model.model_name as string
            const kingdomId = getKingdomId(modelName)
            const kingdomInfo = KINGDOMS[kingdomId]

            if (!kingdomMap[kingdomId]) {
                kingdomMap[kingdomId] = {
                    id: kingdomId,
                    name: kingdomInfo?.name ?? `The ${kingdomId.charAt(0).toUpperCase() + kingdomId.slice(1)} Realm`,
                    dark_lord: kingdomInfo?.darkLord ?? "The Shadow Council",
                    order: kingdomInfo?.order ?? 99,
                    provinces: [],
                    claimed_count: 0,
                    dark_lord_count: 0,
                }
            }

            const realOwner = ownerMap.get(modelName)
            const seed = seedMap.get(modelName)

            let ownerType: OwnerType
            let ownerName: string | null

            if (seed?.faction_type === "founding_keep") {
                ownerType = "founding_keep"
                ownerName = "Aporto Founding Keep"
            } else if (realOwner && Number(realOwner.total_tokens) > 0) {
                ownerType = "claimed"
                ownerName = realOwner.username?.trim() || `user_${realOwner.user_id}`
            } else if (seed) {
                ownerType = "dark_lord"
                ownerName = seed.faction_name
            } else if (kingdomInfo) {
                // Known kingdom, no specific seed — use kingdom-level Dark Lord
                ownerType = "dark_lord"
                ownerName = kingdomInfo.darkLord
            } else {
                ownerType = "fog"
                ownerName = null
            }

            // Display name: strip provider prefix for cleanliness
            const displayName = modelName.includes("/")
                ? modelName.split("/").slice(1).join("/")
                : modelName

            kingdomMap[kingdomId].provinces.push({
                model_id: modelName,
                display_name: displayName,
                owner_type: ownerType,
                owner_name: ownerName,
                total_tokens_30d: Number(model.total_tokens_30d || 0),
            })

            if (ownerType === "claimed") kingdomMap[kingdomId].claimed_count++
            else if (ownerType === "dark_lord") kingdomMap[kingdomId].dark_lord_count++
        }

        // 5. Sort: provinces by token volume; kingdoms by order then claimed count
        for (const kingdom of Object.values(kingdomMap)) {
            kingdom.provinces.sort((a, b) => b.total_tokens_30d - a.total_tokens_30d)
            kingdom.provinces = kingdom.provinces.slice(0, 8)
        }

        const orderedKingdoms = Object.values(kingdomMap).sort((a, b) => {
            const aKnown = KINGDOMS[a.id] ? 0 : 1
            const bKnown = KINGDOMS[b.id] ? 0 : 1
            if (aKnown !== bKnown) return aKnown - bKnown
            return a.order - b.order
        })

        const totalProvinces = orderedKingdoms.reduce((s, k) => s + k.provinces.length, 0)
        const totalClaimed = orderedKingdoms.reduce((s, k) => s + k.claimed_count, 0)

        return NextResponse.json({
            kingdoms: orderedKingdoms,
            updated_at: new Date().toISOString(),
            stats: {
                total_kingdoms: orderedKingdoms.length,
                total_provinces: totalProvinces,
                total_claimed: totalClaimed,
                week: getWeekNumber(),
            },
        })
    } catch (err) {
        console.error("[conquest] Error:", err)
        return NextResponse.json({ error: "Failed to load conquest map" }, { status: 500 })
    }
}

function getWeekNumber(): number {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    const diff = now.getTime() - start.getTime()
    return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7)
}
