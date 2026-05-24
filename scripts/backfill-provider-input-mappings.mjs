/**
 * Backfill provider input mappings into Provider.syncConfig.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-provider-input-mappings.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APIFY_INPUT_MAPPINGS = {
    query: ["query", "searchQuery", "keyword", "searchStringsArray"],
    limit: [
        "maxResults",
        "maxItems",
        "limit",
        "resultsLimit",
        "maxCrawledPlaces",
        "maxCrawledPlacesPerSearch",
        "maxPlacesPerSearch",
        "maxTotalPlaces",
        "totalMaxPlaces",
        "count",
        "pageSize",
        "numResults",
        "resultsCount",
        "maximumResults",
    ],
    url: [
        "url",
        "urls",
        "startUrls",
        "profileUrls",
        "companyUrls",
        "jobUrls",
    ],
    location: ["location", "city", "area", "country", "address", "place"],
    text: ["text", "prompt", "input", "content", "message"],
};

function parseConfig(value) {
    if (!value) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function mergeMappings(existing = {}, additions = {}) {
    const merged = { ...existing };
    for (const [semantic, fields] of Object.entries(additions)) {
        merged[semantic] = unique([...(merged[semantic] ?? []), ...fields]);
    }
    return merged;
}

async function main() {
    const providers = await prisma.$queryRawUnsafe(`
        SELECT id, name, "syncConfig"
        FROM "Provider"
        WHERE endpoint LIKE '%/api/providers/apify%'
           OR name ILIKE 'Apify - %'
           OR "syncConfig" LIKE '%"actorId"%'
        ORDER BY id ASC
    `);

    let updated = 0;
    for (const provider of providers) {
        const config = parseConfig(provider.syncConfig);
        const nextConfig = {
            ...config,
            inputMappings: mergeMappings(config.inputMappings, APIFY_INPUT_MAPPINGS),
        };
        await prisma.$executeRawUnsafe(
            `UPDATE "Provider" SET "syncConfig" = $2 WHERE id = $1`,
            provider.id,
            JSON.stringify(nextConfig),
        );
        updated += 1;
    }

    console.log(`Backfilled inputMappings for ${updated} providers.`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
