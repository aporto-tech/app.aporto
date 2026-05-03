/**
 * Global Apify Store catalog importer.
 *
 * Rules:
 *   - Import only runnable PAY_PER_EVENT actors allowed for agentic users.
 *   - One Skill per canonical capability: {Platform} {DataType} {Verb}.
 *   - Apify actors become Providers on the canonical Skill.
 *   - High-confidence matches can be applied automatically.
 *   - Ambiguous actors are written to a review JSON file.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-apify-catalog.mjs
 *   node --env-file=.env.local scripts/import-apify-catalog.mjs --apply --min-confidence=0.82
 *   node --env-file=.env.local scripts/import-apify-catalog.mjs --limit=500 --review-file=tmp/apify-review.json
 */

import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_API_KEY = process.env.APIFY_API_KEY;
const NEWAPI_URL = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;
const PROVIDER_ENDPOINT = "https://app.aporto.tech/api/providers/apify";

if (!APIFY_API_KEY) throw new Error("APIFY_API_KEY is required");
if (!NEWAPI_ADMIN_KEY) throw new Error("NEWAPI_ADMIN_KEY is required");

const args = parseArgs(process.argv.slice(2));
const APPLY = args.apply === true;
const LIMIT = Number(args.limit ?? 0);
const OFFSET = Number(args.offset ?? 0);
const PAGE_SIZE = Math.min(Number(args.pageSize ?? 100), 100);
const MIN_CONFIDENCE = Number(args.minConfidence ?? 0.82);
const REVIEW_FILE = String(args.reviewFile ?? "tmp/apify-catalog-review.json");
const MAX_PROVIDERS_PER_SKILL = Number(args.maxProvidersPerSkill ?? 0);
const MIN_PROVIDERS_PER_SKILL = Number(args.minProvidersPerSkill ?? 1);

const PLATFORM_RULES = [
    ["Google Maps", ["google maps", "google places", "google-map", "google-place"]],
    ["Google Search", ["google search", "google serp", "google-search"]],
    ["Google Trends", ["google trends"]],
    ["Google News", ["google news"]],
    ["Google Play", ["google play"]],
    ["App Store", ["app store", "apple app"]],
    ["YouTube", ["youtube", "you tube"]],
    ["Instagram", ["instagram"]],
    ["TikTok", ["tiktok", "tik tok"]],
    ["Facebook Ads Library", ["facebook ads library", "facebook ad library", "facebook ads", "meta ads"]],
    ["Facebook", ["facebook"]],
    ["LinkedIn", ["linkedin", "linked in"]],
    ["X", ["twitter", "x.com"]],
    ["Reddit", ["reddit"]],
    ["Amazon", ["amazon"]],
    ["Walmart", ["walmart"]],
    ["eBay", ["ebay"]],
    ["Etsy", ["etsy"]],
    ["Shopify", ["shopify"]],
    ["AliExpress", ["aliexpress", "ali express"]],
    ["Airbnb", ["airbnb"]],
    ["Booking.com", ["booking.com", "booking com"]],
    ["Tripadvisor", ["tripadvisor", "trip advisor"]],
    ["Yelp", ["yelp"]],
    ["Indeed", ["indeed"]],
    ["Glassdoor", ["glassdoor"]],
    ["Upwork", ["upwork"]],
    ["GitHub", ["github", "git hub"]],
    ["Product Hunt", ["product hunt"]],
    ["Crunchbase", ["crunchbase"]],
    ["Zillow", ["zillow"]],
    ["Realtor.com", ["realtor.com", "realtor com"]],
    ["Telegram", ["telegram"]],
    ["Discord", ["discord"]],
    ["Pinterest", ["pinterest"]],
    ["Medium", ["medium"]],
    ["Substack", ["substack"]],
    ["Hacker News", ["hacker news"]],
    ["Quora", ["quora"]],
    ["Website", ["website", "web scraper", "web crawler", "web page", "contact info", "contact details"]],
];

const DATA_RULES = [
    ["Company Profile", ["company profile", "company profiles", "company page", "company details"]],
    ["Job Listing", ["job listing", "job listings", "jobs", "job ", "career"]],
    ["Business Listing", ["business listing", "business listings", "business", "businesses", "place", "places"]],
    ["Real Estate Listing", ["real estate", "property", "properties", "zillow", "realtor"]],
    ["Search Result", ["search result", "search results", "serp"]],
    ["Product", ["product", "products", "asin", "sku"]],
    ["Email", ["email", "emails"]],
    ["Lead", ["lead", "leads", "prospect", "prospects"]],
    ["Review", ["review", "reviews"]],
    ["Comment", ["comment", "comments"]],
    ["Post", ["post", "posts", "tweet", "tweets"]],
    ["Video", ["video", "videos", "shorts", "reel", "reels"]],
    ["Profile", ["profile", "profiles", "user", "users", "account", "accounts"]],
    ["Ad", ["ad library", " ads", "advertisement", "advertising", "creative"]],
    ["Article", ["article", "articles", "news"]],
    ["Event", ["event", "events"]],
    ["Page", ["page", "pages", "website", "web page", "crawler"]],
];

const CATEGORY_MAP = new Map([
    ["Google Maps", "scraping/maps"],
    ["Yelp", "scraping/maps"],
    ["Tripadvisor", "scraping/travel"],
    ["Airbnb", "scraping/travel"],
    ["Booking.com", "scraping/travel"],
    ["Amazon", "scraping/ecommerce"],
    ["Walmart", "scraping/ecommerce"],
    ["eBay", "scraping/ecommerce"],
    ["Etsy", "scraping/ecommerce"],
    ["Shopify", "scraping/ecommerce"],
    ["AliExpress", "scraping/ecommerce"],
    ["Indeed", "scraping/jobs"],
    ["Glassdoor", "scraping/jobs"],
    ["LinkedIn", "scraping/social"],
    ["Instagram", "scraping/social"],
    ["TikTok", "scraping/social"],
    ["YouTube", "scraping/social"],
    ["Facebook", "scraping/social"],
    ["Facebook Ads Library", "scraping/social"],
    ["X", "scraping/social"],
    ["Reddit", "scraping/social"],
    ["Telegram", "scraping/social"],
    ["Discord", "scraping/social"],
    ["Pinterest", "scraping/social"],
    ["GitHub", "developer/github"],
    ["Google Search", "search/web"],
    ["Google News", "search/news"],
    ["Google Trends", "analytics/trends"],
    ["Website", "scraping/web"],
    ["Crunchbase", "intelligence/company"],
    ["Product Hunt", "intelligence/product"],
    ["Zillow", "scraping/real-estate"],
    ["Realtor.com", "scraping/real-estate"],
]);

const STOP_TOKENS = new Set(["scraper", "crawler", "extractor", "api", "free", "official", "advanced", "fast", "cheap", "data"]);

function parseArgs(argv) {
    const out = {};
    for (const arg of argv) {
        if (arg === "--apply") out.apply = true;
        else if (arg.includes("=")) {
            const [key, value] = arg.replace(/^--/, "").split("=");
            out[key] = value;
        }
    }
    return out;
}

async function fetchWithRetry(url, options = {}, attempts = 4) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fetch(url, options);
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
    throw lastError;
}

async function fetchStorePage(offset, limit) {
    const url = new URL(`${APIFY_BASE}/store`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("pricingModel", "PAY_PER_EVENT");
    url.searchParams.set("allowsAgenticUsers", "true");
    url.searchParams.set("includeUnrunnableActors", "false");
    url.searchParams.set("sortBy", "popularity");
    url.searchParams.set("responseFormat", "full");

    const res = await fetchWithRetry(url.toString());
    if (!res.ok) throw new Error(`Apify Store ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
}

function actorText(actor) {
    return [
        actor.title,
        actor.name,
        actor.username,
        actor.description,
        actor.readmeSummary,
        ...(actor.categories ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
}

function actorPrimaryText(actor) {
    return [
        actor.title,
        actor.name,
        actor.username,
    ].filter(Boolean).join(" ").toLowerCase();
}

function hasProxy(actor) {
    const text = actorText(actor);
    return text.includes("proxy") || text.includes("vpn");
}

function detectByRules(text, rules) {
    let best = null;
    for (const [label, terms] of rules) {
        const matches = terms.filter((term) => matchesTerm(text, term));
        if (!matches.length) continue;
        const score = Math.max(...matches.map((term) => term.length));
        if (!best || score > best.score) best = { label, score, matches };
    }
    return best;
}

function matchesTerm(text, term) {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

function inferDataType(platform, text, pricing) {
    if (platform === "LinkedIn") {
        if (matchesTerm(text, "post comments") || matchesTerm(text, "comments")) return { label: "Comment", score: 35, matches: ["comments"] };
        if (matchesTerm(text, "company posts") || matchesTerm(text, "profile posts") || matchesTerm(text, "post") || matchesTerm(text, "posts") || matchesTerm(text, "reactions")) return { label: "Post", score: 35, matches: ["posts"] };
        if (matchesTerm(text, "job") || matchesTerm(text, "jobs")) return { label: "Job Listing", score: 35, matches: ["jobs"] };
        if (matchesTerm(text, "company") || matchesTerm(text, "companies")) return { label: "Company Profile", score: 35, matches: ["company"] };
        if (matchesTerm(text, "profile") || matchesTerm(text, "people") || matchesTerm(text, "person")) return { label: "Profile", score: 35, matches: ["profile"] };
    }

    if (platform === "Facebook Ads Library") return { label: "Ad", score: 30, matches: ["facebook ads library"] };
    if (platform === "Google Maps" && /review/.test(text)) return { label: "Review", score: 25, matches: ["review"] };
    if (platform === "Google Maps") return { label: "Business Listing", score: 25, matches: ["google maps"] };
    if (platform === "Google Search") return { label: "Search Result", score: 30, matches: ["google search"] };
    if ((platform === "Indeed" || platform === "Glassdoor") && /job|career/.test(text)) return { label: "Job Listing", score: 25, matches: ["job"] };
    if ((platform === "Zillow" || platform === "Realtor.com") && /property|real estate|listing/.test(text)) return { label: "Real Estate Listing", score: 25, matches: ["property"] };
    if (["Instagram", "Reddit", "Facebook", "X", "Pinterest", "Medium", "Substack", "Hacker News", "Quora"].includes(platform) && !detectByRules(text, DATA_RULES)) {
        return { label: "Post", score: 20, matches: ["platform-default"] };
    }
    if (["TikTok", "YouTube"].includes(platform) && !detectByRules(text, DATA_RULES)) {
        return { label: "Video", score: 20, matches: ["platform-default"] };
    }
    if (platform === "Website" && (matchesTerm(text, "email") || matchesTerm(text, "contact info") || matchesTerm(text, "contact details"))) {
        return { label: "Email", score: 30, matches: ["contact"] };
    }

    const eventTitle = pricing?.primaryEventTitle?.toLowerCase() ?? "";
    const eventName = pricing?.primaryEventName?.toLowerCase() ?? "";
    const fromEvent = detectByRules(`${eventTitle} ${eventName}`, DATA_RULES);
    const fromText = detectByRules(text, DATA_RULES);

    if (fromEvent && (!fromText || fromEvent.score >= fromText.score)) return fromEvent;
    return fromText;
}

function normalizeSkillName(platform, dataType) {
    if (platform === "Google Search" && dataType === "Search Result") return "Google Search Result Extractor";
    if (platform === "LinkedIn" && dataType === "Profile") return "LinkedIn Person Profile Extractor";
    if (platform === "Website" && dataType === "Email") return "Website Business Email Finder";
    const verb = dataType === "Email" ? "Finder" : "Extractor";
    return `${platform} ${dataType} ${verb}`;
}

function slug(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function getPrimaryPricing(actor) {
    const pricingInfo = actor?.currentPricingInfo;
    if (!pricingInfo || pricingInfo.pricingModel !== "PAY_PER_EVENT") return null;

    const events = pricingInfo.pricingPerEvent?.actorChargeEvents ?? {};
    const entries = Object.entries(events);
    if (!entries.length) return null;

    const primary = entries.find(([, event]) => event.isPrimaryEvent) ?? entries.find(([, event]) => !event.isOneTimeEvent) ?? entries[0];
    const [eventName, eventData] = primary;
    const explicitPrice = typeof eventData.eventPriceUsd === "number" ? eventData.eventPriceUsd : null;
    const tierPrice = eventData.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd
        ?? eventData.eventTieredPricingUsd?.BRONZE?.tieredEventPriceUsd
        ?? eventData.eventTieredPricingUsd?.SILVER?.tieredEventPriceUsd
        ?? eventData.eventTieredPricingUsd?.GOLD?.tieredEventPriceUsd
        ?? eventData.eventTieredPricingUsd?.PLATINUM?.tieredEventPriceUsd
        ?? eventData.eventTieredPricingUsd?.DIAMOND?.tieredEventPriceUsd
        ?? null;

    return {
        pricingModel: pricingInfo.pricingModel,
        primaryEventName: eventName,
        primaryEventTitle: eventData.eventTitle,
        primaryEventPriceUsd: explicitPrice ?? tierPrice,
        minimalMaxTotalChargeUsd: pricingInfo.minimalMaxTotalChargeUsd ?? null,
        pricingSnapshot: pricingInfo,
    };
}

function classifyActor(actor) {
    const text = actorText(actor);
    const primaryText = actorPrimaryText(actor);
    const pricing = getPrimaryPricing(actor);
    if (!pricing) return { confidence: 0, reason: "missing-pay-per-event-pricing" };
    if (hasProxy(actor)) return { confidence: 0, reason: "proxy-related" };

    const platform = detectByRules(primaryText, PLATFORM_RULES);
    const dataType = platform ? inferDataType(platform.label, primaryText, pricing) : null;

    if (!platform || !dataType) {
        return {
            confidence: platform ? 0.58 : 0.35,
            reason: !platform ? "unknown-platform" : "unknown-data-type",
            platform: platform?.label ?? null,
            dataType: dataType?.label ?? null,
            pricing,
        };
    }

    const categories = actor.categories ?? [];
    const runCount = actor.stats?.publicActorRunStats30Days?.TOTAL ?? 0;
    const confidence = Math.min(0.98,
        0.55
        + Math.min(platform.score / 60, 0.18)
        + Math.min(dataType.score / 60, 0.18)
        + (runCount > 0 ? 0.05 : 0)
        + (categories.length ? 0.02 : 0));

    const name = normalizeSkillName(platform.label, dataType.label);
    return {
        confidence,
        reason: "classified",
        name,
        platform: platform.label,
        dataType: dataType.label,
        category: categoryFor(platform.label, dataType.label),
        pricing,
    };
}

function categoryFromDataType(dataType) {
    if (dataType === "Job Listing") return "scraping/jobs";
    if (dataType === "Product") return "scraping/ecommerce";
    if (dataType === "Real Estate Listing") return "scraping/real-estate";
    if (dataType === "Email" || dataType === "Lead") return "intelligence/leads";
    if (dataType === "Search Result") return "search/web";
    return "scraping/web";
}

function categoryFor(platform, dataType) {
    const dataCategory = categoryFromDataType(dataType);
    if (!["scraping/web"].includes(dataCategory)) return dataCategory;
    return CATEGORY_MAP.get(platform) ?? dataCategory;
}

function buildSkillDefinition(group) {
    const { name, platform, dataType, category } = group;
    const platformSlug = slug(platform);
    const dataSlug = slug(dataType);
    const plural = pluralizeDataType(dataType);
    const paramsSchema = {
        query: "string - search query, URL, handle, ID, or platform-specific lookup value",
        maxResults: "number - max records to return",
        url: "string - optional direct URL when supported by the provider",
    };

    return {
        name,
        description: `Extract ${plural.toLowerCase()} from ${platform}. Use for automation workflows, data enrichment, research, monitoring, and agent-driven data collection.`,
        category,
        capabilities: unique([
            `extract-${platformSlug}-${dataSlug}s`,
            `extract-${dataSlug}s`,
            `scrape-${platformSlug}`,
            "bulk-extraction",
            "structured-data-extraction",
        ]),
        inputTypes: unique([
            "text/search-query",
            "text/url",
            platform ? `text/${platformSlug}-url` : null,
        ]),
        outputTypes: unique([
            `text/${dataSlug}-data`,
            "text/json",
            "text/csv",
        ]),
        tags: unique([
            platformSlug,
            dataSlug,
            "apify",
            "scraping",
            ...group.sampleCategories.map((c) => slug(c)),
        ]),
        paramsSchema,
    };
}

function pluralizeDataType(dataType) {
    if (dataType.endsWith("y")) return `${dataType.slice(0, -1)}ies`;
    if (dataType.endsWith("s")) return dataType;
    return `${dataType}s`;
}

async function embedText(text) {
    const res = await fetchWithRetry(`${NEWAPI_URL}/v1/embeddings`, {
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
    return [
        skill.category ? `category:${skill.category}` : null,
        skill.capabilities?.length ? `capabilities:${skill.capabilities.join(",")}` : null,
        skill.inputTypes?.length ? `input:${skill.inputTypes.join(",")}` : null,
        skill.outputTypes?.length ? `output:${skill.outputTypes.join(",")}` : null,
        `${skill.name}: ${skill.description}`,
    ].filter(Boolean).join(" ");
}

async function ensureSkill(skillDef) {
    const existing = (await prisma.$queryRawUnsafe(
        `SELECT id FROM "Skill" WHERE name = $1 LIMIT 1`,
        skillDef.name,
    ))[0];

    const paramsSchema = JSON.stringify(skillDef.paramsSchema);
    const tags = JSON.stringify(skillDef.tags);
    const capabilities = JSON.stringify(skillDef.capabilities);
    const inputTypes = JSON.stringify(skillDef.inputTypes);
    const outputTypes = JSON.stringify(skillDef.outputTypes);

    if (existing) {
        await prisma.$executeRawUnsafe(
            `UPDATE "Skill"
             SET status = 'live', "isActive" = true
             WHERE id = $1`,
            existing.id,
        );
        return { id: existing.id, created: false };
    }

    const vec = await embedText(buildEmbedText(skillDef));

    const rows = await prisma.$queryRawUnsafe(
        `INSERT INTO "Skill" (name, description, category, capabilities, "inputTypes", "outputTypes", tags, "paramsSchema", embedding, status, "isActive")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, 'live', true)
         RETURNING id`,
        skillDef.name,
        skillDef.description,
        skillDef.category,
        capabilities,
        inputTypes,
        outputTypes,
        tags,
        paramsSchema,
        `[${vec.join(",")}]`,
    );

    return { id: rows[0].id, created: true };
}

async function upsertProvider(skillId, actor, classification) {
    const actorId = `${actor.username}~${actor.name}`;
    const providerName = `Apify - ${actor.username}/${actor.name}`;
    const pricing = classification.pricing;
    const pricePerCall = pricing.primaryEventPriceUsd ?? 0;
    const runs30d = actor.stats?.publicActorRunStats30Days?.TOTAL ?? 0;
    const sourceUrl = actor.url ?? `https://apify.com/${actor.username}/${actor.name}`;
    const syncConfig = JSON.stringify({
        actorId,
        pricing,
        classifier: {
            confidence: classification.confidence,
            platform: classification.platform,
            dataType: classification.dataType,
        },
        source: "apify-store-global",
        sourceUrl,
        importedAt: new Date().toISOString(),
    });

    const existing = (await prisma.$queryRawUnsafe(
        `SELECT id FROM "Provider" WHERE name = $1 AND "skillId" = $2 LIMIT 1`,
        providerName,
        skillId,
    ))[0];

    if (existing) {
        await prisma.$executeRawUnsafe(
            `UPDATE "Provider"
             SET endpoint = $2, "isActive" = true, "pricePerCall" = $3,
                 "providerSecret" = $4, "syncConfig" = $5
             WHERE id = $1`,
            existing.id,
            PROVIDER_ENDPOINT,
            pricePerCall,
            APIFY_API_KEY,
            syncConfig,
        );
        return { created: false, runs30d };
    }

    await prisma.$executeRawUnsafe(
        `INSERT INTO "Provider" (name, "skillId", endpoint, "isActive", "pricePerCall", "providerSecret", "syncConfig")
         VALUES ($1, $2, $3, true, $4, $5, $6)`,
        providerName,
        skillId,
        PROVIDER_ENDPOINT,
        pricePerCall,
        APIFY_API_KEY,
        syncConfig,
    );

    return { created: true, runs30d };
}

async function collectActors() {
    const actors = [];
    let offset = OFFSET;
    let total = Infinity;

    while (offset < total) {
        const pageLimit = LIMIT ? Math.min(PAGE_SIZE, LIMIT - actors.length) : PAGE_SIZE;
        if (pageLimit <= 0) break;
        const data = await fetchStorePage(offset, pageLimit);
        const items = data.data?.items ?? [];
        total = data.data?.total ?? total;
        actors.push(...items);
        console.log(`Fetched ${actors.length}/${LIMIT || total} actors`);
        if (!items.length) break;
        offset += items.length;
    }

    return { actors, total };
}

function buildGroups(actors) {
    const groups = new Map();
    const review = [];
    const seenActors = new Set();

    for (const actor of actors) {
        if (seenActors.has(actor.id)) continue;
        seenActors.add(actor.id);

        const classification = classifyActor(actor);
        const actorSummary = {
            actorId: `${actor.username}~${actor.name}`,
            providerName: `Apify - ${actor.username}/${actor.name}`,
            title: actor.title,
            url: actor.url ?? `https://apify.com/${actor.username}/${actor.name}`,
            runs30d: actor.stats?.publicActorRunStats30Days?.TOTAL ?? 0,
            categories: actor.categories ?? [],
            confidence: classification.confidence,
            reason: classification.reason,
            proposedSkill: classification.name ?? null,
            platform: classification.platform ?? null,
            dataType: classification.dataType ?? null,
        };

        if (classification.confidence < MIN_CONFIDENCE || !classification.name) {
            review.push(actorSummary);
            continue;
        }

        if (!groups.has(classification.name)) {
            groups.set(classification.name, {
                name: classification.name,
                platform: classification.platform,
                dataType: classification.dataType,
                category: classification.category,
                actors: [],
                sampleCategories: [],
            });
        }

        const group = groups.get(classification.name);
        group.actors.push({ actor, classification });
        group.sampleCategories.push(...(actor.categories ?? []));
    }

    for (const group of groups.values()) {
        group.sampleCategories = unique(group.sampleCategories);
        group.actors.sort((a, b) =>
            (b.actor.stats?.publicActorRunStats30Days?.TOTAL ?? 0) -
            (a.actor.stats?.publicActorRunStats30Days?.TOTAL ?? 0));
        if (MAX_PROVIDERS_PER_SKILL > 0) {
            group.actors = group.actors.slice(0, MAX_PROVIDERS_PER_SKILL);
        }
    }

    const autoGroups = [];
    for (const group of groups.values()) {
        if (group.actors.length < MIN_PROVIDERS_PER_SKILL) {
            for (const { actor, classification } of group.actors) {
                review.push({
                    actorId: `${actor.username}~${actor.name}`,
                    providerName: `Apify - ${actor.username}/${actor.name}`,
                    title: actor.title,
                    url: actor.url ?? `https://apify.com/${actor.username}/${actor.name}`,
                    runs30d: actor.stats?.publicActorRunStats30Days?.TOTAL ?? 0,
                    categories: actor.categories ?? [],
                    confidence: classification.confidence,
                    reason: `group-has-fewer-than-${MIN_PROVIDERS_PER_SKILL}-providers`,
                    proposedSkill: classification.name ?? null,
                    platform: classification.platform ?? null,
                    dataType: classification.dataType ?? null,
                });
            }
            continue;
        }
        autoGroups.push(group);
    }

    return { groups: autoGroups.sort((a, b) => b.actors.length - a.actors.length), review };
}

async function writeReviewFile(payload) {
    await fs.mkdir(path.dirname(REVIEW_FILE), { recursive: true });
    await fs.writeFile(REVIEW_FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
    console.log(`Apify catalog import (${APPLY ? "apply" : "dry-run"})`);
    console.log(`minConfidence=${MIN_CONFIDENCE}, limit=${LIMIT || "all"}, offset=${OFFSET}, maxProvidersPerSkill=${MAX_PROVIDERS_PER_SKILL || "all"}, minProvidersPerSkill=${MIN_PROVIDERS_PER_SKILL}`);

    const { actors, total } = await collectActors();
    const { groups, review } = buildGroups(actors);

    const reviewPayload = {
        generatedAt: new Date().toISOString(),
        totalAvailable: total,
        scanned: actors.length,
        minConfidence: MIN_CONFIDENCE,
        autoGroups: groups.map((group) => ({
            skillName: group.name,
            category: group.category,
            providers: group.actors.length,
            topProviders: group.actors.slice(0, 10).map(({ actor, classification }) => ({
                providerName: `Apify - ${actor.username}/${actor.name}`,
                title: actor.title,
                url: actor.url ?? `https://apify.com/${actor.username}/${actor.name}`,
                runs30d: actor.stats?.publicActorRunStats30Days?.TOTAL ?? 0,
                confidence: classification.confidence,
                pricePerCall: classification.pricing?.primaryEventPriceUsd ?? null,
            })),
        })),
        review,
    };
    await writeReviewFile(reviewPayload);

    console.log(`Classified groups: ${groups.length}`);
    console.log(`Actors for review: ${review.length}`);
    console.log(`Review file: ${REVIEW_FILE}`);

    if (!APPLY) {
        console.log("Dry run only. Re-run with --apply to write Skill/Provider rows.");
        return;
    }

    let skillsCreated = 0;
    let skillsUpdated = 0;
    let providersCreated = 0;
    let providersUpdated = 0;

    for (const group of groups) {
        const skillDef = buildSkillDefinition(group);
        const skillResult = await ensureSkill(skillDef);
        if (skillResult.created) skillsCreated++;
        else skillsUpdated++;

        for (const { actor, classification } of group.actors) {
            const result = await upsertProvider(skillResult.id, actor, classification);
            if (result.created) providersCreated++;
            else providersUpdated++;
        }

        console.log(`${skillResult.created ? "+" : "~"} ${group.name}: ${group.actors.length} providers`);
    }

    console.log(`
Apify catalog import complete.
Total available: ${total}
Scanned: ${actors.length}
Skills created: ${skillsCreated}
Skills updated: ${skillsUpdated}
Providers created: ${providersCreated}
Providers updated: ${providersUpdated}
Actors sent to review: ${review.length}
Review file: ${REVIEW_FILE}
`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
