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
        name: "Google Maps Business Listing Extractor",
        description: "Scrape business listings from Google Maps. Extracts business name, address, phone number, website, ratings, review count, business hours, and GPS coordinates. Use for lead generation, local business research, competitor mapping, and building B2B contact lists.",
        category: "scraping/maps",
        capabilities: [
            "extract-google-maps-business-listings", "extract-business-data",
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
        matchKeywords: ["google maps", "maps"],
        pricePerCall: 0.003,
    },
    {
        name: "Google Maps Review Extractor",
        description: "Scrape customer reviews from Google Maps business listings. Extracts reviewer name, rating, review text, date, and owner replies. Use for sentiment analysis, reputation monitoring, and competitive intelligence.",
        category: "scraping/maps",
        capabilities: [
            "extract-google-maps-reviews", "extract-review-text",
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
        matchKeywords: ["google maps review", "google maps reviews", "maps reviews"],
        pricePerCall: 0.001,
    },
    {
        name: "Yelp Business Listing Extractor",
        description: "Scrape business listings and reviews from Yelp. Extracts business name, address, phone, website, ratings, review count, categories, hours, and photos. Use for local business research, lead generation, and competitive analysis.",
        category: "scraping/maps",
        capabilities: [
            "extract-yelp-business-listings", "extract-business-data",
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
        matchKeywords: ["yelp"],
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
        searchTerms: ["linkedin company scraper", "linkedin company profile scraper"],
        matchKeywords: ["linkedin company", "company profile", "company scraper"],
        requiredKeywords: ["linkedin"],
        excludeKeywords: ["posts", "jobs"],
        pricePerCall: 0.005,
    },
    {
        name: "LinkedIn Person Profile Extractor",
        description: "Extract public person profile data from LinkedIn pages. Returns profile name, headline, location, current company, work history, education, skills, profile URL, and optional contact enrichment when supported by the provider. Use for lead enrichment, recruiting research, sales prospecting, and CRM enrichment.",
        category: "scraping/social",
        capabilities: [
            "extract-linkedin-person-profiles", "extract-person-profile",
            "extract-headline", "extract-location", "extract-current-company",
            "extract-work-history", "extract-education", "extract-skills",
            "extract-profile-url", "contact-enrichment", "lead-enrichment",
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
        searchTerms: ["linkedin profile scraper", "linkedin people scraper", "linkedin profile enrichment"],
        matchKeywords: ["linkedin profile detail", "linkedin profile scraper", "linkedin people", "profile enrichment"],
        requiredKeywords: ["linkedin"],
        excludeKeywords: ["posts", "post", "company", "jobs", "y combinator", "yc"],
        pricePerCall: 0.012,
    },
    {
        name: "LinkedIn Profile Posts Extractor",
        description: "Extract posts from LinkedIn person profile pages. Returns post text, author profile, post URL, publish date, media, reactions, comments, shares, and engagement counts when available. Use for social listening, founder research, lead intent detection, and creator intelligence.",
        category: "scraping/social",
        capabilities: [
            "extract-linkedin-profile-posts", "extract-linkedin-posts",
            "extract-post-text", "extract-post-url", "extract-post-date",
            "extract-post-media", "extract-reaction-count", "extract-comment-count",
            "extract-share-count", "social-listening", "intent-detection",
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
        searchTerms: ["linkedin profile posts scraper"],
        matchKeywords: ["linkedin profile posts", "profile posts"],
        requiredKeywords: ["linkedin"],
        pricePerCall: 0.004,
    },
    {
        name: "LinkedIn Company Posts Extractor",
        description: "Extract posts from LinkedIn company pages. Returns post content, company author, post URL, publish date, media, reactions, comments, shares, and engagement counts when available. Use for competitor monitoring, market intelligence, brand tracking, and B2B intent research.",
        category: "scraping/social",
        capabilities: [
            "extract-linkedin-company-posts", "extract-linkedin-posts",
            "extract-company-posts", "extract-post-text", "extract-post-url",
            "extract-post-date", "extract-post-media", "extract-reaction-count",
            "extract-comment-count", "extract-share-count", "competitor-monitoring",
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
        searchTerms: ["linkedin company posts scraper"],
        matchKeywords: ["linkedin company posts", "company posts"],
        requiredKeywords: ["linkedin"],
        pricePerCall: 0.004,
    },
    {
        name: "LinkedIn Post Search Result Extractor",
        description: "Search and extract LinkedIn posts by keyword, profile, company, or post URL. Returns post text, author, author URL, post URL, publish date, media, reactions, comments, shares, and optional author enrichment when supported. Use for topic monitoring, market research, lead intent, and content intelligence.",
        category: "scraping/social",
        capabilities: [
            "search-linkedin-posts", "extract-linkedin-posts",
            "extract-post-text", "extract-post-author", "extract-post-url",
            "extract-post-date", "extract-post-media", "extract-reaction-count",
            "extract-comment-count", "extract-share-count", "filter-by-keyword",
            "filter-by-company", "filter-by-profile", "content-intelligence",
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
        searchTerms: ["linkedin posts scraper", "linkedin post search"],
        matchKeywords: ["linkedin post", "linkedin posts"],
        requiredKeywords: ["linkedin"],
        pricePerCall: 0.004,
    },
    {
        name: "LinkedIn Job Listing Extractor",
        description: "Scrape LinkedIn job listings and job detail pages. Returns job title, company, location, salary range when available, job description, requirements, applicants count, posted date, employment type, and application URL. Use for recruiting intelligence, job market research, salary analysis, and talent pipeline planning.",
        category: "scraping/jobs",
        capabilities: [
            "extract-linkedin-job-listings", "extract-job-listings",
            "extract-job-title", "extract-company-name", "extract-location",
            "extract-salary", "extract-job-description", "extract-requirements",
            "extract-applicants-count", "extract-application-url",
            "filter-by-location", "filter-by-keyword", "job-market-research",
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
        searchTerms: ["linkedin jobs scraper", "linkedin job scraper"],
        matchKeywords: ["linkedin job", "linkedin jobs"],
        requiredKeywords: ["linkedin"],
        pricePerCall: 0.002,
    },
    {
        name: "Amazon Product Extractor",
        description: "Scrape product listings from Amazon. Extracts product title, price, rating, review count, ASIN, description, images, seller info, and availability. Use for price monitoring, competitive analysis, and product research.",
        category: "scraping/ecommerce",
        capabilities: [
            "extract-amazon-products", "extract-product-data",
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
        matchKeywords: ["amazon"],
        pricePerCall: 0.003,
    },
    {
        name: "Website Business Email Finder",
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
        matchKeywords: ["email", "contact details", "business email"],
        pricePerCall: 0.005,
    },
    {
        name: "Indeed Job Listing Extractor",
        description: "Scrape job listings from Indeed. Extracts job title, company name, location, salary, job description, requirements, and application URL. Use for job market research, recruiting intelligence, and talent pipeline analysis.",
        category: "scraping/jobs",
        capabilities: [
            "extract-indeed-job-listings", "extract-job-listings",
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
        matchKeywords: ["indeed", "job listing", "job scraper", "career site"],
        pricePerCall: 0.002,
    },
    {
        name: "Google Search Result Extractor",
        description: "Scrape Google search result pages. Extracts organic results, snippets, ads, AI mode results, and related signals. Use for SEO research, competitive intelligence, lead discovery, and search-driven workflows.",
        category: "search/web",
        capabilities: [
            "extract-google-search-results", "extract-search-results",
            "extract-snippet", "extract-ads",
            "extract-ai-mode", "seo-research",
            "competitive-intelligence", "lead-discovery",
        ],
        inputTypes: ["text/search-query", "text/url"],
        outputTypes: ["text/search-results", "text/json", "text/csv"],
        tags: ["google", "search", "seo", "research", "scraping"],
        paramsSchema: {
            searchQuery: "string — search query",
            maxResults: "number — max results per page or query",
            countryCode: "string — optional country filter",
        },
        searchTerms: ["google search results scraper", "google search scraper"],
        matchKeywords: ["google search results", "google search"],
        pricePerCall: 0.0045,
    },
    {
        name: "Reddit Post Extractor",
        description: "Scrape Reddit posts, comments, subreddits, and author data. Use for social listening, community research, trend discovery, and audience research.",
        category: "scraping/social",
        capabilities: [
            "extract-reddit-posts", "extract-posts",
            "extract-comments", "extract-subreddits",
            "extract-author-data", "social-listening",
            "trend-discovery", "community-research",
        ],
        inputTypes: ["text/search-query", "text/url", "text/subreddit"],
        outputTypes: ["text/post-data", "text/comment-data", "text/json", "text/csv"],
        tags: ["reddit", "social", "community", "trends", "scraping"],
        paramsSchema: {
            searchQuery: "string — subreddit, post, or topic query",
            maxResults: "number — max posts or comments",
        },
        searchTerms: ["reddit scraper", "reddit posts scraper"],
        matchKeywords: ["reddit"],
        pricePerCall: 0.002,
    },
    {
        name: "YouTube Video Extractor",
        description: "Scrape YouTube videos, channels, comments, and metadata. Use for content research, creator intelligence, topic discovery, and audience analysis.",
        category: "scraping/social",
        capabilities: [
            "extract-youtube-videos", "extract-videos",
            "extract-channels", "extract-comments",
            "extract-transcripts", "creator-intelligence",
            "content-research", "audience-analysis",
        ],
        inputTypes: ["text/search-query", "text/url", "text/channel"],
        outputTypes: ["text/video-data", "text/comment-data", "text/json", "text/csv"],
        tags: ["youtube", "video", "creator", "content", "scraping"],
        paramsSchema: {
            searchQuery: "string — video, channel, or topic query",
            maxResults: "number — max videos",
        },
        searchTerms: ["youtube scraper", "youtube channel scraper"],
        matchKeywords: ["youtube"],
        pricePerCall: 0.003,
    },
    {
        name: "Instagram Post Extractor",
        description: "Scrape Instagram profiles, posts, reels, hashtags, and comments. Use for social listening, influencer research, and brand tracking.",
        category: "scraping/social",
        capabilities: [
            "extract-instagram-posts", "extract-profiles",
            "extract-posts", "extract-reels",
            "extract-hashtags", "extract-comments",
            "social-listening", "influencer-research",
        ],
        inputTypes: ["text/search-query", "text/url", "text/profile"],
        outputTypes: ["text/profile-data", "text/post-data", "text/json", "text/csv"],
        tags: ["instagram", "social", "reels", "influencer", "scraping"],
        paramsSchema: {
            searchQuery: "string — profile, hashtag, or topic query",
            maxResults: "number — max posts or profiles",
        },
        searchTerms: ["instagram scraper", "instagram profile scraper"],
        matchKeywords: ["instagram"],
        pricePerCall: 0.004,
    },
    {
        name: "TikTok Video Extractor",
        description: "Scrape TikTok profiles, videos, hashtags, and comments. Use for trend monitoring, creator intelligence, and short-form content analysis.",
        category: "scraping/social",
        capabilities: [
            "extract-tiktok-videos", "extract-videos",
            "extract-profiles", "extract-hashtags",
            "extract-comments", "trend-monitoring",
            "creator-intelligence",
        ],
        inputTypes: ["text/search-query", "text/url", "text/profile"],
        outputTypes: ["text/video-data", "text/profile-data", "text/json", "text/csv"],
        tags: ["tiktok", "video", "social", "trends", "scraping"],
        paramsSchema: {
            searchQuery: "string — profile, hashtag, or topic query",
            maxResults: "number — max videos or profiles",
        },
        searchTerms: ["tiktok scraper", "tiktok profile scraper"],
        matchKeywords: ["tiktok"],
        pricePerCall: 0.004,
    },
    {
        name: "Facebook Ads Library Ad Extractor",
        description: "Scrape Facebook Ads Library results. Extracts advertiser names, creative previews, ad copy, running dates, and targeting signals. Use for competitor intelligence and ad research.",
        category: "scraping/social",
        capabilities: [
            "extract-facebook-ads-library-ads", "extract-ad-creatives",
            "extract-ad-copy", "extract-advertiser",
            "extract-running-dates", "competitor-intelligence",
            "ad-research",
        ],
        inputTypes: ["text/search-query", "text/url", "text/advertiser"],
        outputTypes: ["text/ad-data", "text/json", "text/csv"],
        tags: ["facebook", "ads", "advertising", "competitor-intelligence", "scraping"],
        paramsSchema: {
            searchQuery: "string — advertiser, keyword, or page query",
            maxResults: "number — max ads",
        },
        searchTerms: ["facebook ads library scraper", "facebook ads scraper"],
        matchKeywords: ["facebook ads", "ads library"],
        pricePerCall: 0.003,
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

async function fetchWithRetry(url, options = {}, attempts = 3) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fetch(url, options);
        } catch (error) {
            lastError = error;
            if (i < attempts - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    throw lastError;
}

async function searchActors(query, limit = 10) {
    const url = new URL(`${APIFY_BASE}/store`);
    url.searchParams.set("search", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("pricingModel", "PAY_PER_EVENT");
    url.searchParams.set("allowsAgenticUsers", "true");
    url.searchParams.set("includeUnrunnableActors", "false");
    url.searchParams.set("sortBy", "popularity");
    url.searchParams.set("responseFormat", "full");

    const res = await fetchWithRetry(url.toString());
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Apify store error ${res.status}: ${txt.substring(0, 200)}`);
    }
    const data = await res.json();
    return (data.data?.items ?? []).filter(a => !hasProxy(a));
}

function getPrimaryPricing(actor) {
    const pricingInfo = actor?.currentPricingInfo;
    if (!pricingInfo || pricingInfo.pricingModel !== "PAY_PER_EVENT") return null;

    const events = pricingInfo.pricingPerEvent?.actorChargeEvents ?? {};
    const entries = Object.entries(events);
    if (!entries.length) return null;

    const primary = entries.find(([, event]) => event.isPrimaryEvent) ?? entries[0];
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

function matchesSkill(actor, skillDef) {
    const haystack = [
        actor.title,
        actor.description,
        actor.username,
        actor.name,
        actor.readmeSummary,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    const hasRequiredKeywords = (skillDef.requiredKeywords ?? [])
        .every((keyword) => haystack.includes(keyword.toLowerCase()));
    const hasExcludedKeywords = (skillDef.excludeKeywords ?? [])
        .some((keyword) => haystack.includes(keyword.toLowerCase()));
    const hasMatchKeyword = (skillDef.matchKeywords ?? [])
        .some((keyword) => haystack.includes(keyword.toLowerCase()));

    return hasRequiredKeywords && !hasExcludedKeywords && hasMatchKeyword;
}

async function getActorVersion(actorId) {
    try {
        const res = await fetchWithRetry(`${APIFY_BASE}/acts/${actorId}`, {
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
            await prisma.$executeRawUnsafe(
                `UPDATE "Skill"
                    SET description = $2,
                        category = $3,
                        capabilities = $4,
                        "inputTypes" = $5,
                        "outputTypes" = $6,
                        tags = $7,
                        "paramsSchema" = $8,
                        status = 'live',
                        "isActive" = true
                  WHERE id = $1`,
                skillId,
                skillDef.description,
                skillDef.category,
                JSON.stringify(skillDef.capabilities),
                JSON.stringify(skillDef.inputTypes),
                JSON.stringify(skillDef.outputTypes),
                JSON.stringify(skillDef.tags),
                JSON.stringify(skillDef.paramsSchema),
            );

            const embedTextStr = buildEmbedText(skillDef);
            const vec = await embedText(embedTextStr);
            await prisma.$executeRawUnsafe(
                `UPDATE "Skill" SET embedding = $1::vector WHERE id = $2`,
                `[${vec.join(",")}]`,
                skillId,
            );

            console.log(`  Skill already exists (id=${skillId}), metadata and embedding updated`);
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
                if (a.currentPricingInfo?.pricingModel !== "PAY_PER_EVENT") continue;
                if ((a.stats?.publicActorRunStats30Days?.TOTAL ?? 0) <= 0) continue;
                if (!matchesSkill(a, skillDef)) continue;
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
            const providerName = `Apify - ${actor.username}/${actor.name}`;
            const pricing = getPrimaryPricing(actor);
            const pricePerCall = pricing?.primaryEventPriceUsd ?? skillDef.pricePerCall ?? 0;

            // Check if provider already exists
            const existing = (await prisma.$queryRawUnsafe(
                `SELECT id FROM "Provider" WHERE name = $1 AND "skillId" = $2 LIMIT 1`,
                providerName,
                skillId,
            ))[0];

            const syncConfig = JSON.stringify({
                actorId,
                pricing,
                source: "apify-store",
                sourceUrl: actor.url,
                importedAt: new Date().toISOString(),
            });
            const runs30d = actor.stats?.publicActorRunStats30Days?.TOTAL ?? 0;

            if (existing) {
                await prisma.$executeRawUnsafe(
                    `UPDATE "Provider"
                        SET endpoint = $1,
                            "isActive" = true,
                            "pricePerCall" = $2,
                            "providerSecret" = $3,
                            "syncConfig" = $4
                      WHERE id = $5`,
                    PROVIDER_ENDPOINT,
                    pricePerCall,
                    APIFY_API_KEY,
                    syncConfig,
                    existing.id,
                );
                console.log(`  ↺ Provider updated: ${providerName} (${runs30d} runs/30d, $${pricePerCall})`);
                providersCreated++;
                continue;
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

            console.log(`  + Provider: ${providerName} (${runs30d} runs/30d, $${pricePerCall})`);
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
