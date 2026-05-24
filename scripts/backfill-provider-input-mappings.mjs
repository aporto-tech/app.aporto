/**
 * Backfill provider input mappings into Provider.syncConfig.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-provider-input-mappings.mjs
 */

import { PrismaClient } from "@prisma/client";
import { buildApifyInputMappings, fetchApifyActorInputSchema } from "./lib/apify-input-schema.mjs";

const prisma = new PrismaClient();
const APIFY_API_KEY = process.env.APIFY_API_KEY;

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
        const actorInputSchema = config.actorInputSchema
            ?? (config.actorId && APIFY_API_KEY
                ? await fetchApifyActorInputSchema(config.actorId, APIFY_API_KEY)
                : null);
        const nextConfig = {
            ...config,
            actorInputSchema,
            inputMappings: mergeMappings(
                config.inputMappings,
                buildApifyInputMappings(actorInputSchema),
            ),
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
