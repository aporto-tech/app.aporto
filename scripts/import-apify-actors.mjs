/**
 * Apify Actor Import Script — First Wave
 *
 * Imports top Apify actors as Skills + Providers into the Aporto DB.
 *
 * Rules:
 *   - One SKILL per distinct data source + data type + action
 *   - Multiple PROVIDERS per skill (different actors doing the same job)
 *   - actorId stored in provider.syncConfig as { actorId: "username~actor-name" }
 *   - No proxy-required actors
 *   - Top-5 by 30d run count per search term
 *   - Dedup: if skill with same name exists, add provider to it (don't create new skill)
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-apify-actors.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_API_KEY = process.env.APIFY_API_KEY;
const NEWAPI_URL = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;
const PROVIDER_ENDPOINT = "https://app.aporto.tech/api/providers/apify";

if (!APIFY_API_KEY) throw new Error("APIFY_API_KEY is required");
if (!NEWAPI_ADMIN_KEY) throw new Error("NEWAPI_ADMIN_KEY is required");

// ── Skill definitions ──────────────────────────────────────────────────────────
// Each entry defines a skill. Apify actors that match get imported as providers.

const SKILL_DEFINITIONS = [
    {
        name: "Google Maps Business Scraper",
        description: "Scrape business listings from Google Maps. Extracts business name, address, phone number, website, ratings, review count, business hours, and GPS coordinates. Use for lead generation, local business research, competitor mapping, and building B2B contact lists.",
        category: "scraping/maps",
        capabilities: [
            "scrape-google-maps", "extract-business-data",
            "extract-phone-number", "extract-email", "extract-website",
            "extract-business-hours", "extract-gps-coordinates",
            "extract-ratings", "extract-review-count", "extract-place-id",
            "extract-address", "filter-by-rating", "filter-by-location",
            "filter-by-category", "bulk-business-search", "lead-generation",
        ],
        inputTypes: ["text/search-query", "text/location", "text/business-category"],
        outputTypes: ["text/business-data", "text/contact-list", "text/json", "text/csv"],
        tags: ["google-maps", "business", "leads", "scraping", "contacts", "phone", "local-search"],
        paramsSchema: {
            searchQuery: "string — business type or keyword (e.g. 'restaurants', 'plumbers')",
            location: "string — city, address, or area name",
            maxResults: "number — max businesses to return (default: 20)",
            language: "string — language code (default: en)",
        },
        searchTerms: ["google maps scraper", "google places scraper"],
        pricePerCall: 0.003,
    },
    {
        name: "Google Maps Review Scraper",
        description: "Scrape customer reviews from Google Maps business listings. Extracts reviewer name, rating, review text, date, and owner replies. Use for sentiment analysis, reputation monitoring, and competitive intelligence.",
        category: "scraping/maps",
        capabilities: [
            "scrape-google-maps-reviews", "extract-review-text",
            "extract-review-rating", "extract-reviewer-name",
            "extract-review-date", "extract-owner-reply",
            "bulk-review-extraction", "sentiment-data", "reputation-monitoring",
        ],
        inputTypes: ["text/business-name", "text/url", "text/place-id"],
        outputTypes: ["text/review-data", "text/json", "text/csv"],
        tags: ["google-maps", "reviews", "sentiment", "reputation", "scraping"],
        paramsSchema: {
            placeId: "string — Google Place ID or Maps URL",
            maxReviews: "number — max reviews to return (default: 50)",
            language: "string — language code (default: en)",
            sortBy: "string — newest|relevant|highest|lowest (default: newest)",
        },
        searchTerms: ["google maps reviews scraper"],
        pricePerCall: 0.001,
    },
    {
        name: "Yelp Business Scraper",
        description: "Scrape business listings and reviews from Yelp. Extracts business name, address, phone, website, ratings, review count, categories, hours, and photos. Use for local business research, lead generation, and competitive analysis.",
        category: "scraping/maps",
        capabilities: [
            "scrape-yelp", "extract-business-data",
            "extract-phone-number", "extract-website",
            "extract-business-hours", "extract-ratings",
            "extract-review-count", "extract-categories",
            "filter-by-rating", "filter-by-category", "lead-generation",
        ],
        inputTypes: ["text/search-query", "text/location", "text/business-category"],
        outputTypes: ["text/business-data", "text/contact-list", "text/json"],
        tags: ["yelp", "business", "leads", "scraping", "local-search", "restaurants"],
        paramsSchema: {
            searchQuery: "string — business type or keyword",
            location: "string — city or zip code",
            maxResults: "number — max results (default: 20)",
        },
        searchTerms: ["yelp scraper", "yelp business scraper"],
        pricePerCall: 0.002,
    },
    {
        name: "LinkedIn Company Profile Extractor",
        description: "Extract company profiles from LinkedIn. Extracts company name, description, industry, employee count, headquarters, website, founded year, and specialties. Use for B2B prospecting, market research, and company intelligence.",
        category: "scraping/social",
        capabilities: [
            "scrape-linkedin", "extract-company-profile",
            "extract-company-description", "extract-employee-count",
            "extract-industry", "extract-headquarters",
            "extract-company-website", "extract-founded-year",
            "b2b-prospecting", "company-intelligence",
        ],
        inputTypes: ["text/company-name", "text/linkedin-url", "text/search-query"],
        outputTypes: ["text/company-data", "text/json", "text/csv"],
        tags: ["linkedin", "company", "b2b", "scraping", "leads", "prospecting"],
        paramsSchema: {
            companyUrls: "array of strings — LinkedIn company URLs",
            searchQuery: "string — company name or keyword to search",
            maxResults: "number — max companies (default: 10)",
        },
        searchTerms: ["linkedin company scraper", "linkedin profile scraper"],
        pricePerCall: 0.005,
    },
    {
        name: "Amazon Product Scraper",
        description: "Scrape product listings from Amazon. Extracts product title, price, rating, review count, ASIN, description, images, seller info, and availability. Use for price monitoring, competitive analysis, and product research.",
        category: "scraping/ecommerce",
        capabilities: [
            "scrape-amazon", "extract-product-data",
            "extract-price", "extract-product-rating",
            "extract-review-count", "extract-asin",
            "extract-product-description", "extract-seller-info",
            "price-monitoring", "product-research", "competitor-analysis",
        ],
        inputTypes: ["text/search-query", "text/asin", "text/url"],
        outputTypes: ["text/product-data", "text/json", "text/csv"],
        tags: ["amazon", "ecommerce", "price", "product", "scraping", "asin"],
        paramsSchema: {
            searchQuery: "string — product keyword or ASIN",
            maxResults: "number — max products (default: 20)",
            country: "string — Amazon country code (default: US)",
        },
        searchTerms: ["amazon scraper", "amazon product scraper"],
        pricePerCall: 0.003,
    },
    {
        name: "Business Email Finder",
        description: "Find professional email addresses for businesses and contacts. Extracts email addresses from websites, LinkedIn profiles, and public sources. Use for sales outreach, lead enrichment, and email list building.",
        category: "intelligence/email",
        capabilities: [
            "find-email-address", "extract-business-email",
            "email-enrichment", "contact-discovery",
            "domain-email-search", "lead-enrichment",
            "email-verification", "bulk-email-lookup",
        ],
        inputTypes: ["text/domain", "text/company-name", "text/person-name"],
        outputTypes: ["text/email-address", "text/contact-data", "text/json"],
        tags: ["email", "leads", "contact", "outreach", "enrichment", "b2b"],
        paramsSchema: {
            domain: "string — company domain to find emails for",
            firstName: "string — optional, person's first name",
            lastName: "string — optional, person's last name",
            maxResults: "number — max emails to return (default: 10)",
        },
        searchTerms: ["email finder scraper", "business email extractor"],
        pricePerCall: 0.005,
    },
    {
        name: "Indeed Job Listing Scraper",
        description: "Scrape job listings from Indeed. Extracts job title, company name, location, salary, job description, requirements, and application URL. Use for job market research, recruiting intelligence, and talent pipeline analysis.",
        category: "scraping/jobs",
        capabilities: [
            "scrape-indeed", "extract-job-listings",
            "extract-job-title", "extract-salary",
            "extract-job-description", "extract-requirements",
            "extract-company-name", "job-market-research",
            "recruiting-intelligence", "talent-pipeline",
        ],
        inputTypes: ["text/job-title", "text/location", "text/search-query"],
        outputTypes: ["text/job-data", "text/json", "text/csv"],
        tags: ["indeed", "jobs", "recruiting", "salary", "scraping", "hiring"],
        paramsSchema: {
            searchQuery: "string — job title or keyword",
            location: "string — city or remote",
            maxResults: "number — max listings (default: 20)",
            datePosted: "string — last24hours|last3days|last7days|last14days",
        },
        searchTerms: ["indeed scraper", "indeed job scraper"],
        pricePerCall: 0.002,
    },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

async function embedText(text) {
    const res = await fetch(`${NEWAPI_URL}/v1/embeddings`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${NEWAPI_ADMIN_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    if (!res.ok) throw new Error(`Embed error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.data[0].embedding;
}

function buildEmbedText(skill) {
    const parts = [];
    if (skill.category) parts.push(`category:${skill.category}`);
    if (skill.capabilities?.length) parts.push(`capabilities:${skill.capabilities.join(",")}`);
    if (skill.inputTypes?.length) parts.push(`input:${skill.inputTypes.join(",")}`);
    if (skill.outputTypes?.length) parts.push(`output:${skill.outputTypes.join(",")}`);
    parts.push(`${skill.name}: ${skill.description}`);
    return parts.join(" ");
}

function hasProxy(actor) {
    const text = `${actor.title ?? ""} ${actor.description ?? ""}`.toLowerCase();
    return text.includes("proxy") || text.includes("vpn");
}

async function searchActors(query, limit = 10) {
    const url = new URL(`${APIFY_BASE}/store`);
    url.searchParams.set("search", query);
    url.searchParams.set("limit", String(limit));
    // sortBy with dot notation may not be supported — sort client-side instead
    url.searchParams.set("desc", "true");

    const res = await fetch(url.toString());
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Apify store error ${res.status}: ${txt.substring(0, 200)}`);
    }
    const data = await res.json();
    return (data.data?.items ?? []).filter(a => !hasProxy(a));
}

async function getActorVersion(actorId) {
    try {
        const res = await fetch(`${APIFY_BASE}/acts/${actorId}`, {
            headers: { "Authorization": `Bearer ${APIFY_API_KEY}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const version = data.data?.versions?.[0];
        if (version?.exampleRunInput?.body) {
            return { exampleInput: JSON.parse(version.exampleRunInput.body) };
        }
        return null;
    } catch {
        return null;
    }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
    console.log("Starting Apify actor import...\n");

    let skillsCreated = 0;
    let skillsReused = 0;
    let providersCreated = 0;
    let actorsSkipped = 0;

    for (const skillDef of SKILL_DEFINITIONS) {
        console.log(`\n── Skill: ${skillDef.name} ──`);

        // 1. Find or create skill
        let skillId;
        const existingSkill = (await prisma.$queryRawUnsafe(
            `SELECT id FROM "Skill" WHERE name = $1 LIMIT 1`,
            skillDef.name,
        ))[0];

        if (existingSkill) {
            skillId = existingSkill.id;
            console.log(`  Skill already exists (id=${skillId}), adding providers to it`);
            skillsReused++;
        } else {
            // Create skill
            await prisma.$executeRawUnsafe(
                `INSERT INTO "Skill" (name, description, category, capabilities, "inputTypes", "outputTypes", tags, "paramsSchema", status, "isActive")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'live', true)`,
                skillDef.name,
                skillDef.description,
                skillDef.category,
                JSON.stringify(skillDef.capabilities),
                JSON.stringify(skillDef.inputTypes),
                JSON.stringify(skillDef.outputTypes),
                JSON.stringify(skillDef.tags),
                JSON.stringify(skillDef.paramsSchema),
            );
            const newSkill = (await prisma.$queryRawUnsafe(
                `SELECT id FROM "Skill" WHERE name = $1 LIMIT 1`,
                skillDef.name,
            ))[0];
            skillId = newSkill.id;

            // Generate embedding
            const embedTextStr = buildEmbedText(skillDef);
            const vec = await embedText(embedTextStr);
            await prisma.$executeRawUnsafe(
                `UPDATE "Skill" SET embedding = $1::vector WHERE id = $2`,
                `[${vec.join(",")}]`,
                skillId,
            );
            console.log(`  Created skill id=${skillId}, embedding generated`);
            skillsCreated++;
        }

        // 2. Search Apify store for matching actors
        const allActors = [];
        for (const term of skillDef.searchTerms) {
            const found = await searchActors(term, 10);
            for (const a of found) {
                if (!allActors.find(x => x.id === a.id)) allActors.push(a);
            }
        }

        // Take top 5 by 30d runs, no proxy
        const topActors = allActors
            .sort((a, b) =>
                (b.stats?.publicActorRunStats30Days?.TOTAL ?? 0) -
                (a.stats?.publicActorRunStats30Days?.TOTAL ?? 0)
            )
            .slice(0, 5);

        console.log(`  Found ${topActors.length} actors to import`);

        // 3. Create providers for each actor
        for (const actor of topActors) {
            const actorId = `${actor.username}~${actor.name}`;
            const providerName = `Apify — ${actor.username}/${actor.name}`;

            // Check if provider already exists
            const existing = (await prisma.$queryRawUnsafe(
                `SELECT id FROM "Provider" WHERE name = $1 AND "skillId" = $2 LIMIT 1`,
                providerName,
                skillId,
            ))[0];

            if (existing) {
                console.log(`  Provider already exists: ${providerName}`);
                actorsSkipped++;
                continue;
            }

            const syncConfig = JSON.stringify({ actorId });
            const runs30d = actor.stats?.publicActorRunStats30Days?.TOTAL ?? 0;

            await prisma.$executeRawUnsafe(
                `INSERT INTO "Provider" (name, "skillId", endpoint, "isActive", "pricePerCall", "providerSecret", "syncConfig")
                 VALUES ($1, $2, $3, true, $4, $5, $6)`,
                providerName,
                skillId,
                PROVIDER_ENDPOINT,
                skillDef.pricePerCall,
                APIFY_API_KEY,
                syncConfig,
            );

            console.log(`  + Provider: ${providerName} (${runs30d} runs/30d)`);
            providersCreated++;
        }
    }

    // Summary
    console.log(`
╔══════════════════════════════════════════╗
║          APIFY IMPORT SUMMARY            ║
╠══════════════════════════════════════════╣
║  Skills created:   ${String(skillsCreated).padEnd(22)}║
║  Skills reused:    ${String(skillsReused).padEnd(22)}║
║  Providers created:${String(providersCreated).padEnd(22)}║
║  Actors skipped:   ${String(actorsSkipped).padEnd(22)}║
╚══════════════════════════════════════════╝
`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
