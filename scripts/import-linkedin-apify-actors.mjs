/**
 * LinkedIn Apify Actor Import Script
 *
 * Creates LinkedIn Skills and attaches Apify actors as Providers.
 *
 * Rules:
 *   - One Skill per distinct LinkedIn data type + action
 *   - Multiple Providers per Skill when different Apify actors do the same job
 *   - Provider name: "Apify - {username}/{actor-name}"
 *   - provider.syncConfig stores { actorId: "username~actor-name" }
 *   - Provider endpoint stays the internal Aporto Apify wrapper
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-linkedin-apify-actors.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APIFY_API_KEY = process.env.APIFY_API_KEY;
const NEWAPI_URL = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;
const PROVIDER_ENDPOINT = "https://app.aporto.tech/api/providers/apify";

if (!APIFY_API_KEY) throw new Error("APIFY_API_KEY is required");
if (!NEWAPI_ADMIN_KEY) throw new Error("NEWAPI_ADMIN_KEY is required");

const LINKEDIN_SKILLS = [
    {
        name: "LinkedIn Person Profile Extractor",
        description: "Extract public person profile data from LinkedIn pages. Returns profile name, headline, location, current company, work history, education, skills, profile URL, and optional contact enrichment when supported by the provider. Use for lead enrichment, recruiting research, sales prospecting, and CRM enrichment.",
        category: "scraping/social",
        capabilities: [
            "scrape-linkedin-profile",
            "extract-person-profile",
            "extract-headline",
            "extract-location",
            "extract-current-company",
            "extract-work-history",
            "extract-education",
            "extract-skills",
            "extract-profile-url",
            "contact-enrichment",
            "lead-enrichment",
            "bulk-profile-extraction",
        ],
        inputTypes: ["text/linkedin-profile-url", "text/person-name", "text/search-query"],
        outputTypes: ["text/person-profile", "text/contact-data", "text/json", "text/csv"],
        tags: ["linkedin", "profile", "people", "leads", "recruiting", "sales", "scraping"],
        paramsSchema: {
            profileUrls: "array of strings — LinkedIn person profile URLs",
            searchQuery: "string — optional person/company search query when provider supports search",
            maxResults: "number — max profiles to return",
            includeEmail: "boolean — request email enrichment when supported",
        },
        pricePerCall: 0.012,
        providers: [
            { username: "dev_fusion", actor: "Linkedin-Profile-Scraper" },
            { username: "harvestapi", actor: "linkedin-profile-scraper" },
            { username: "anchor", actor: "linkedin-profile-enrichment" },
        ],
    },
    {
        name: "LinkedIn Company Profile Extractor",
        description: "Extract company profile data from LinkedIn company pages. Returns company name, description, industry, website, headquarters, employee count, follower count, founded year, specialties, locations, and company URL. Use for B2B prospecting, account research, market mapping, and company intelligence.",
        category: "scraping/social",
        capabilities: [
            "scrape-linkedin-company",
            "extract-company-profile",
            "extract-company-description",
            "extract-industry",
            "extract-company-website",
            "extract-headquarters",
            "extract-employee-count",
            "extract-follower-count",
            "extract-founded-year",
            "extract-company-specialties",
            "company-intelligence",
            "b2b-prospecting",
            "bulk-company-extraction",
        ],
        inputTypes: ["text/linkedin-company-url", "text/company-name", "text/search-query"],
        outputTypes: ["text/company-data", "text/json", "text/csv"],
        tags: ["linkedin", "company", "b2b", "leads", "company-intelligence", "scraping"],
        paramsSchema: {
            companyUrls: "array of strings — LinkedIn company page URLs",
            searchQuery: "string — company name or keyword when provider supports search",
            maxResults: "number — max companies to return",
        },
        pricePerCall: 0.006,
        providers: [
            { username: "harvestapi", actor: "linkedin-company" },
            { username: "harvestapi", actor: "linkedin-company-search" },
            { username: "pratikdani", actor: "linkedin-company-profile-scraper" },
        ],
    },
    {
        name: "LinkedIn Profile Posts Extractor",
        description: "Extract posts from LinkedIn person profile pages. Returns post text, author profile, post URL, publish date, media, reactions, comments, shares, and engagement counts when available. Use for social listening, founder research, lead intent detection, and creator intelligence.",
        category: "scraping/social",
        capabilities: [
            "scrape-linkedin-profile-posts",
            "extract-linkedin-posts",
            "extract-post-text",
            "extract-post-url",
            "extract-post-date",
            "extract-post-media",
            "extract-reaction-count",
            "extract-comment-count",
            "extract-share-count",
            "social-listening",
            "intent-detection",
        ],
        inputTypes: ["text/linkedin-profile-url", "text/person-name"],
        outputTypes: ["text/social-posts", "text/engagement-data", "text/json", "text/csv"],
        tags: ["linkedin", "posts", "profile", "social-listening", "engagement", "scraping"],
        paramsSchema: {
            profileUrls: "array of strings — LinkedIn person profile URLs",
            maxPosts: "number — max posts per profile",
            includeComments: "boolean — include comments when supported",
            includeReactions: "boolean — include reactions when supported",
        },
        pricePerCall: 0.004,
        providers: [
            { username: "harvestapi", actor: "linkedin-profile-posts" },
        ],
    },
    {
        name: "LinkedIn Company Posts Extractor",
        description: "Extract posts from LinkedIn company pages. Returns post content, company author, post URL, publish date, media, reactions, comments, shares, and engagement counts when available. Use for competitor monitoring, market intelligence, brand tracking, and B2B intent research.",
        category: "scraping/social",
        capabilities: [
            "scrape-linkedin-company-posts",
            "extract-linkedin-posts",
            "extract-company-posts",
            "extract-post-text",
            "extract-post-url",
            "extract-post-date",
            "extract-post-media",
            "extract-reaction-count",
            "extract-comment-count",
            "extract-share-count",
            "competitor-monitoring",
            "market-intelligence",
        ],
        inputTypes: ["text/linkedin-company-url", "text/company-name"],
        outputTypes: ["text/social-posts", "text/engagement-data", "text/json", "text/csv"],
        tags: ["linkedin", "company", "posts", "brand-monitoring", "competitive-intelligence", "scraping"],
        paramsSchema: {
            companyUrls: "array of strings — LinkedIn company page URLs",
            maxPosts: "number — max posts per company",
            includeComments: "boolean — include comments when supported",
            includeReactions: "boolean — include reactions when supported",
        },
        pricePerCall: 0.004,
        providers: [
            { username: "harvestapi", actor: "linkedin-company-posts" },
        ],
    },
    {
        name: "LinkedIn Post Search Scraper",
        description: "Search and extract LinkedIn posts by keyword, profile, company, or post URL. Returns post text, author, author URL, post URL, publish date, media, reactions, comments, shares, and optional author enrichment when supported. Use for topic monitoring, market research, lead intent, and content intelligence.",
        category: "scraping/social",
        capabilities: [
            "search-linkedin-posts",
            "scrape-linkedin-posts",
            "extract-post-text",
            "extract-post-author",
            "extract-post-url",
            "extract-post-date",
            "extract-post-media",
            "extract-reaction-count",
            "extract-comment-count",
            "extract-share-count",
            "filter-by-keyword",
            "filter-by-company",
            "filter-by-profile",
            "content-intelligence",
        ],
        inputTypes: ["text/search-query", "text/linkedin-post-url", "text/linkedin-profile-url", "text/linkedin-company-url"],
        outputTypes: ["text/social-posts", "text/engagement-data", "text/json", "text/csv"],
        tags: ["linkedin", "posts", "search", "social-listening", "content-intelligence", "scraping"],
        paramsSchema: {
            searchQuery: "string — keyword, topic, company, or profile filter",
            postUrls: "array of strings — optional LinkedIn post URLs",
            maxResults: "number — max posts to return",
            includeAuthorProfile: "boolean — enrich post authors when supported",
        },
        pricePerCall: 0.004,
        providers: [
            { username: "supreme_coder", actor: "linkedin-post" },
            { username: "harvestapi", actor: "linkedin-post-search" },
        ],
    },
    {
        name: "LinkedIn Job Listing Scraper",
        description: "Scrape LinkedIn job listings and job detail pages. Returns job title, company, location, salary range when available, job description, requirements, applicants count, posted date, employment type, and application URL. Use for recruiting intelligence, job market research, salary analysis, and talent pipeline planning.",
        category: "scraping/jobs",
        capabilities: [
            "scrape-linkedin-jobs",
            "extract-job-listings",
            "extract-job-title",
            "extract-company-name",
            "extract-location",
            "extract-salary",
            "extract-job-description",
            "extract-requirements",
            "extract-applicants-count",
            "extract-application-url",
            "filter-by-location",
            "filter-by-keyword",
            "job-market-research",
            "recruiting-intelligence",
        ],
        inputTypes: ["text/job-title", "text/location", "text/search-query", "text/linkedin-jobs-url"],
        outputTypes: ["text/job-data", "text/json", "text/csv"],
        tags: ["linkedin", "jobs", "recruiting", "salary", "job-market", "scraping"],
        paramsSchema: {
            searchQuery: "string — job title, keyword, or role",
            location: "string — city, country, or remote",
            jobUrls: "array of strings — optional LinkedIn job URLs",
            maxResults: "number — max jobs to return",
            datePosted: "string — optional provider-supported date filter",
        },
        pricePerCall: 0.002,
        providers: [
            { username: "curious_coder", actor: "linkedin-jobs-scraper" },
            { username: "cheap_scraper", actor: "linkedin-job-scraper" },
            { username: "worldunboxer", actor: "rapid-linkedin-scraper" },
            { username: "valig", actor: "linkedin-jobs-scraper" },
        ],
    },
];

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

async function ensureSkill(skill) {
    const existing = (await prisma.$queryRawUnsafe(
        `SELECT id FROM "Skill" WHERE name = $1 LIMIT 1`,
        skill.name,
    ))[0];

    const paramsSchema = JSON.stringify(skill.paramsSchema);
    const tags = JSON.stringify(skill.tags);
    const capabilities = JSON.stringify(skill.capabilities);
    const inputTypes = JSON.stringify(skill.inputTypes);
    const outputTypes = JSON.stringify(skill.outputTypes);

    if (existing) {
        await prisma.$executeRawUnsafe(
            `UPDATE "Skill"
             SET description = $2, category = $3, capabilities = $4, "inputTypes" = $5,
                 "outputTypes" = $6, tags = $7, "paramsSchema" = $8, status = 'live', "isActive" = true
             WHERE id = $1`,
            existing.id,
            skill.description,
            skill.category,
            capabilities,
            inputTypes,
            outputTypes,
            tags,
            paramsSchema,
        );

        const vec = await embedText(buildEmbedText(skill));
        await prisma.$executeRawUnsafe(
            `UPDATE "Skill" SET embedding = $1::vector WHERE id = $2`,
            `[${vec.join(",")}]`,
            existing.id,
        );

        return { id: existing.id, created: false };
    }

    await prisma.$executeRawUnsafe(
        `INSERT INTO "Skill" (name, description, category, capabilities, "inputTypes", "outputTypes", tags, "paramsSchema", status, "isActive")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'live', true)`,
        skill.name,
        skill.description,
        skill.category,
        capabilities,
        inputTypes,
        outputTypes,
        tags,
        paramsSchema,
    );

    const created = (await prisma.$queryRawUnsafe(
        `SELECT id FROM "Skill" WHERE name = $1 LIMIT 1`,
        skill.name,
    ))[0];

    const vec = await embedText(buildEmbedText(skill));
    await prisma.$executeRawUnsafe(
        `UPDATE "Skill" SET embedding = $1::vector WHERE id = $2`,
        `[${vec.join(",")}]`,
        created.id,
    );

    return { id: created.id, created: true };
}

async function ensureProvider(skillId, skill, provider) {
    const actorId = `${provider.username}~${provider.actor}`;
    const name = `Apify - ${provider.username}/${provider.actor}`;
    const existing = (await prisma.$queryRawUnsafe(
        `SELECT id FROM "Provider" WHERE name = $1 AND "skillId" = $2 LIMIT 1`,
        name,
        skillId,
    ))[0];

    const syncConfig = JSON.stringify({ actorId });

    if (existing) {
        await prisma.$executeRawUnsafe(
            `UPDATE "Provider"
             SET endpoint = $2, "isActive" = true, "pricePerCall" = $3,
                 "providerSecret" = $4, "syncConfig" = $5
             WHERE id = $1`,
            existing.id,
            PROVIDER_ENDPOINT,
            skill.pricePerCall,
            APIFY_API_KEY,
            syncConfig,
        );
        return { id: existing.id, created: false };
    }

    const rows = await prisma.$queryRawUnsafe(
        `INSERT INTO "Provider" (name, "skillId", endpoint, "isActive", "pricePerCall", "providerSecret", "syncConfig")
         VALUES ($1, $2, $3, true, $4, $5, $6)
         RETURNING id`,
        name,
        skillId,
        PROVIDER_ENDPOINT,
        skill.pricePerCall,
        APIFY_API_KEY,
        syncConfig,
    );

    return { id: rows[0].id, created: true };
}

async function main() {
    let skillsCreated = 0;
    let skillsUpdated = 0;
    let providersCreated = 0;
    let providersUpdated = 0;

    console.log("Starting LinkedIn Apify actor import...\n");

    for (const skill of LINKEDIN_SKILLS) {
        const skillResult = await ensureSkill(skill);
        if (skillResult.created) skillsCreated++;
        else skillsUpdated++;

        console.log(`${skillResult.created ? "+" : "~"} Skill ${skill.name} (id=${skillResult.id})`);

        for (const provider of skill.providers) {
            const providerResult = await ensureProvider(skillResult.id, skill, provider);
            if (providerResult.created) providersCreated++;
            else providersUpdated++;

            console.log(`  ${providerResult.created ? "+" : "~"} Apify - ${provider.username}/${provider.actor} (id=${providerResult.id})`);
        }
    }

    console.log(`
LinkedIn Apify import complete.
Skills created: ${skillsCreated}
Skills updated: ${skillsUpdated}
Providers created: ${providersCreated}
Providers updated: ${providersUpdated}
`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
