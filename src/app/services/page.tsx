"use client";

import React, { useState, useEffect } from "react";
import DashboardLayout from "../components/DashboardLayout";
import AddServiceModal from "../components/AddServiceModal";
import styles from "./services.module.css";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type ProviderDetail = {
    name: string;
    description: string;
    pricing: Record<string, string>;
    path: string;
    baseUrl?: string;
    method: "POST" | "GET" | "PATCH" | "PUT" | "DELETE";
    sampleBody: unknown;
};

type Skill = {
    id: string;
    icon: string;
    title: string;
    desc: string;
    providers: number;
    providerDetails: ProviderDetail[];
};

type ApiToken = {
    key: string;
    remain_quota?: number;
    unlimited_quota?: boolean;
};

const SKILLS: Skill[] = [
    {
        id: "mcp-router", icon: "⚡", title: "Aporto MCP Router", desc: "One MCP endpoint for 1000+ skills and 12,000+ daily requests", providers: 1000,
        providerDetails: [{ name: "Aporto Skill Network", description: "Discover skills, route each request to the best available provider, and pay per successful call.", pricing: { "Discovery": "Free", "Execution": "Skill pricing", "Network": "1000+ skills" }, path: "/api/mcp", baseUrl: "https://app.aporto.tech", method: "POST", sampleBody: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } }]
    },
    {
        id: "skill-discovery", icon: "🔎", title: "Skill Discovery", desc: "Find the right capability by intent instead of hard-coding a vendor", providers: 1000,
        providerDetails: [{ name: "aporto_discover_skills", description: "Semantic discovery across the Aporto skill catalog before execution.", pricing: { "Discovery": "Free", "Routing": "Included" }, path: "/api/mcp", baseUrl: "https://app.aporto.tech", method: "POST", sampleBody: { intent: "Find LinkedIn profiles for AI agency operators", maxResults: 5 } }]
    },
    {
        id: "linkedin", icon: "💼", title: "LinkedIn Data Skills", desc: "Profile, company, post, and jobs extraction with multiple active providers", providers: 19,
        providerDetails: [
            { name: "LinkedIn Person Profile Extractor", description: "Extract public LinkedIn profile fields from one or more profile URLs.", pricing: { "Per run": "Provider pricing", "Routing": "Best provider selected" }, path: "/api/routing/execute", baseUrl: "https://app.aporto.tech", method: "POST", sampleBody: { skill: "LinkedIn Person Profile Extractor", input: { profileUrls: ["https://www.linkedin.com/in/example"] } } },
            { name: "LinkedIn Company Profile Extractor", description: "Extract company pages, metadata, and public company details.", pricing: { "Per run": "Provider pricing" }, path: "/api/routing/execute", baseUrl: "https://app.aporto.tech", method: "POST", sampleBody: { skill: "LinkedIn Company Profile Extractor", input: { companyUrls: ["https://www.linkedin.com/company/example"] } } },
            { name: "LinkedIn Job Listing Scraper", description: "Search and extract LinkedIn job listings for recruiting and market research workflows.", pricing: { "Per run": "Provider pricing" }, path: "/api/routing/execute", baseUrl: "https://app.aporto.tech", method: "POST", sampleBody: { skill: "LinkedIn Job Listing Scraper", input: { query: "AI engineer", location: "United States" } } }
        ]
    },
    {
        id: "sms", icon: "💬", title: "SMS Verification", desc: "Phone number verification and OTP delivery", providers: 1,
        providerDetails: [{ name: "Prelude", description: "Phone verification", pricing: { "Send verification": "$0.015", "Check code": "Free" }, path: "/api/services/sms", baseUrl: "https://app.aporto.tech", method: "POST", sampleBody: { to: "+1234567890" } }]
    },
    {
        id: "llm", icon: "🤖", title: "Aporto AI Models", desc: "400+ models from OpenAI, Anthropic & more at official prices", providers: 1,
        providerDetails: [{ name: "Aporto AI", description: "Universal API provider with 400+ world-class models. All pricing is passed through at official rates with zero markup.", pricing: { "Per Token": "Official Rates" }, path: "/v1/chat/completions", method: "POST", sampleBody: { model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "Hello from Aporto Skill Network!" }] } }]
    },
    {
        id: "search", icon: "🌐", title: "Web Search Skills", desc: "Real-time web search and information retrieval", providers: 2,
        providerDetails: [
            { name: "Linkup", description: "AI web search", pricing: { "Standard depth": "$0.006", "Deep depth": "$0.055" }, path: "/api/services/search", baseUrl: "https://app.aporto.tech", method: "POST", sampleBody: { query: "Latest AI news", depth: "standard" } },
            { name: "You.com", description: "Real-time AI search", pricing: { "Web search": "$0.005", "Research": "$0.0065" }, path: "/api/services/ai-search", baseUrl: "https://app.aporto.tech", method: "POST", sampleBody: { query: "Machine learning trends", type: "search" } }
        ]
    },
    {
        id: "audio", icon: "🔊", title: "Audio Skills", desc: "AI voice synthesis and transcription", providers: 1,
        providerDetails: [{ name: "ElevenLabs", description: "AI audio synthesis", pricing: { "Text-to-speech": "$0.24/1K chars" }, path: "/api/services/tts", baseUrl: "https://app.aporto.tech", method: "POST", sampleBody: { text: "Hello world!", voice_id: "21m00Tcm4TlvDq8ikWAM" } }]
    },
    {
        id: "image", icon: "🖼️", title: "Image Generation Skills", desc: "AI-powered image creation and editing", providers: 1,
        providerDetails: [{ name: "Fal.ai", description: "AI image generation", pricing: { "FLUX Dev": "$0.015/MP", "FLUX Schnell": "$0.004/MP", "FLUX Pro": "$0.04/MP" }, path: "/api/services/image", baseUrl: "https://app.aporto.tech", method: "POST", sampleBody: { prompt: "A futuristic city", model: "flux-schnell" } }]
    },
    {
        id: "web", icon: "🧭", title: "Web Automation Skills", desc: "Headless browser and web scraping", providers: 1,
        providerDetails: [{ name: "Anchor Browser", description: "Headless browser", pricing: { "Extract content": "$0.02", "Screenshot": "$0.02", "AI task": "$0.05 + $0.02/step" }, path: "/v1/browser/session", method: "POST", sampleBody: { url: "https://example.com" } }]
    },
    {
        id: "compute", icon: "📦", title: "Compute Skills", desc: "Serverless sandboxes and agent hosting", providers: 1,
        providerDetails: [{ name: "Blaxel", description: "Run code, deploy sandboxes,\nand execute scripts in cloud environments", pricing: { "Run code (XS, 30s)": "$0.0007", "Deploy sandbox (S, 24h)": "$3.97", "Create sandbox (S, 4h)": "$0.66", "Exec command": "$0.00001" }, path: "/v1/sandbox/create", method: "POST", sampleBody: { action: "run" } }]
    },
    {
        id: "messaging", icon: "📨", title: "Messaging Skills", desc: "Serverless message queuing and scheduling", providers: 1,
        providerDetails: [{ name: "Upstash QStash", description: "Message queuing", pricing: { "Per message": "$0.0001" }, path: "/v1/messaging/publish", method: "POST", sampleBody: { topic: "updates", message: "Hello!" } }]
    },
    {
        id: "db", icon: "🗄️", title: "Data Skills", desc: "Managed databases — Redis, Vector, and Search", providers: 3,
        providerDetails: [
            { name: "Upstash Redis", description: "Serverless Redis", pricing: { "Per command": "$0.000002" }, path: "/v1/redis/set", method: "POST", sampleBody: { key: "foo", value: "bar" } },
            { name: "Pinecone", description: "Vector DB", pricing: { "Per query": "$0.001" }, path: "/v1/vector/query", method: "POST", sampleBody: { vector: [0.1, 0.2], topK: 5 } },
            { name: "Qdrant", description: "Vector Search", pricing: { "Per operation": "$0.0005" }, path: "/v1/qdrant/search", method: "POST", sampleBody: { collection: "docs", vector: [0.1, 0.2] } }
        ]
    },
];

export default function ServicesPage() {
    const { status } = useSession();
    const router = useRouter();
    const [apiKey, setApiKey] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [showAddServiceModal, setShowAddServiceModal] = useState(false);
    const [selectedService, setSelectedService] = useState<Skill | null>(null);
    const [selectedProvider, setSelectedProvider] = useState<ProviderDetail | null>(null);
    const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
    const [codeTab, setCodeTab] = useState<"Fetch" | "Axios">("Fetch");
    const [copySuccess, setCopySuccess] = useState({ key: false, code: false });

    // Real data state
    const [balance, setBalance] = useState<{ remainingUSD: number; usedUSD: number } | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(true);
    const [activeRulesCount, setActiveRulesCount] = useState(0);
    const [llmConnected, setLlmConnected] = useState(false);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        } else if (status === "authenticated") {
            // Fetch an API key to display in the modal
            fetch("/api/newapi/keys").then(r => r.json()).then(data => {
                if (data.success && data.tokens && data.tokens.length > 0) {
                    // Provide the full usable key so the Copy button works correctly!
                    setApiKey(`sk-${data.tokens[0].key}`);
                    const activeRules = (data.tokens as ApiToken[]).filter((t) => (t.remain_quota ?? 0) > 0 || !t.unlimited_quota);
                    setActiveRulesCount(activeRules.length);
                } else {
                    setApiKey("sk-CREATE_API_KEY_FIRST");
                }
            }).catch(() => { });

            // Fetch balance
            fetch("/api/newapi/balance", { cache: "no-store" })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        setBalance({ remainingUSD: data.remainingUSD ?? 0, usedUSD: data.usedUSD ?? 0 });
                    }
                })
                .catch(() => { })
                .finally(() => setBalanceLoading(false));

            // Fetch logs to check if LLM is "Connected"
            fetch("/api/newapi/logs?page=0&size=1", { cache: "no-store" })
                .then(r => r.json())
                .then(data => {
                    if (data.success && data.logs && data.logs.length > 0) {
                        setLlmConnected(true);
                    }
                })
                .catch(() => { });
        }
    }, [status, router]);

    const handleConnectClick = (service: Skill, provider: ProviderDetail) => {
        setSelectedService(service);
        setSelectedProvider(provider);
        setShowAddServiceModal(true);
    };

    const handleCopy = (type: "key" | "code", text: string) => {
        navigator.clipboard.writeText(text);
        setCopySuccess({ ...copySuccess, [type]: true });
        setTimeout(() => setCopySuccess({ ...copySuccess, [type]: false }), 2000);
    };

    const getFetchCode = () => {
        if (!selectedProvider) return "";
        const bodyStr = JSON.stringify(selectedProvider.sampleBody, null, 2).replace(/\n/g, '\n      ');
        return `
<span class="${styles.comment}">// Example using standard Fetch API for Aporto Skill Network</span>
<span class="${styles.keyword}">const</span> <span class="${styles.function}">APORTO_API_KEY</span> = <span class="${styles.string}">'${apiKey}'</span>;

<span class="${styles.keyword}">async function</span> <span class="${styles.function}">runSkill</span>() {
  <span class="${styles.keyword}">const</span> response = <span class="${styles.keyword}">await</span> <span class="${styles.function}">fetch</span>(<span class="${styles.string}">\`${selectedProvider.baseUrl ?? 'https://api.aporto.tech'}${selectedProvider.path}\`</span>, {
    method: <span class="${styles.string}">'${selectedProvider.method}'</span>,
    headers: {
      <span class="${styles.string}">'Authorization'</span>: <span class="${styles.string}">\`Bearer \${APORTO_API_KEY}\`</span>,
      <span class="${styles.string}">'Content-Type'</span>: <span class="${styles.string}">'application/json'</span>
    },
    body: <span class="${styles.function}">JSON</span>.stringify(${bodyStr})
  });
  
  <span class="${styles.keyword}">const</span> data = <span class="${styles.keyword}">await</span> response.<span class="${styles.function}">json</span>();
  <span class="${styles.function}">console</span>.log(data);
}`;
    };

    const getAxiosCode = () => {
        if (!selectedProvider) return "";
        const bodyStr = JSON.stringify(selectedProvider.sampleBody, null, 2).replace(/\n/g, '\n    ');
        return `
<span class="${styles.comment}">// npm install axios</span>
<span class="${styles.keyword}">import</span> axios <span class="${styles.keyword}">from</span> <span class="${styles.string}">'axios'</span>;

<span class="${styles.keyword}">const</span> <span class="${styles.function}">APORTO_API_KEY</span> = <span class="${styles.string}">'${apiKey}'</span>;

<span class="${styles.keyword}">const</span> client = axios.<span class="${styles.function}">create</span>({
  baseURL: <span class="${styles.string}">'${selectedProvider.baseUrl ?? 'https://api.aporto.tech'}'</span>,
  headers: {
    <span class="${styles.string}">'Authorization'</span>: <span class="${styles.string}">\`Bearer \${APORTO_API_KEY}\`</span>
  }
});

<span class="${styles.keyword}">async function</span> <span class="${styles.function}">runSkill</span>() {
  <span class="${styles.keyword}">const</span> response = <span class="${styles.keyword}">await</span> client.<span class="${styles.function}">${selectedProvider.method.toLowerCase()}</span>(<span class="${styles.string}">'${selectedProvider.path}'</span>, ${bodyStr});
  <span class="${styles.function}">console</span>.log(response.data);
}`;
    };

    return (
        <DashboardLayout>
            <div className={styles.container}>
                {/* Header Card */}
                <div className={styles.headerCard}>
                    <div className={styles.headerContent}>
                        <div className={styles.headerBadge}>
                            AI Skill Network
                        </div>
                        <h1 className={styles.headerTitle}>Skills Your Agent Can Call Today</h1>
                        <p className={styles.headerDesc}>
                            Add one MCP router and discover 1000+ paid skills across scraping, search, AI, audio, images, and automation.<br />
                            Aporto routes each request to the best provider and meters every call.
                        </p>
                        <button
                            onClick={() => setShowAddServiceModal(true)}
                            style={{
                                marginTop: 16,
                                padding: "10px 20px",
                                background: "#22c55e",
                                color: "#000",
                                border: "none",
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: "pointer",
                            }}
                        >
                            + Publish a Skill
                        </button>
                    </div>

                    <div className={styles.headerWidgets}>
                        <div className={styles.widgetBox}>
                            <div className={styles.widgetLabel}>Balance</div>
                            <div className={styles.widgetValue}>
                                {balanceLoading ? "..." : `$${balance?.remainingUSD.toFixed(2) ?? "0.00"}`}
                            </div>
                            <div className={styles.widgetSub}>Available</div>
                        </div>
                        <div className={styles.widgetBox}>
                            <div className={styles.widgetLabel}>Network</div>
                            <div className={styles.widgetValue} style={{ fontSize: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ color: "#00dc82" }}>●</span> 1000+ Skills
                            </div>
                            <div className={styles.widgetSub}>
                                12,000+ requests per day{activeRulesCount > 0 ? ` · ${activeRulesCount} rules` : ""}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Skills List */}
                <div className={styles.serviceList}>
                    {SKILLS.map((srv) => (
                        <div className={styles.serviceCard} key={srv.id}>
                            <div className={styles.serviceCardHeader} onClick={() => setExpandedServiceId(expandedServiceId === srv.id ? null : srv.id)}>
                                <div className={styles.serviceInfo}>
                                    <div className={styles.serviceIcon}>{srv.icon}</div>
                                    <div className={styles.serviceText}>
                                        <h3>{srv.title}</h3>
                                        <p>{srv.desc}</p>
                                    </div>
                                </div>
                                <div className={styles.serviceActions}>
                                    <button
                                        className={`${styles.connectBtn} ${srv.id === "llm" && llmConnected ? styles.connected : ""}`}
                                        onClick={(e) => { e.stopPropagation(); handleConnectClick(srv, srv.providerDetails[0]); }}
                                    >
                                        {srv.id === "llm" && llmConnected ? "Active" : "Use Skill"}
                                    </button>
                                    <div className={styles.providerCount}>
                                        {srv.providers}{srv.providers >= 1000 ? "+" : ""} provider{srv.providers > 1 ? "s" : ""}
                                        <span style={{ transform: expandedServiceId === srv.id ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s" }}>⌄</span>
                                    </div>
                                </div>
                            </div>

                            <div className={`${styles.providersContainer} ${expandedServiceId === srv.id ? styles.expanded : ""}`}>
                                <div className={styles.providersInner}>
                                    <div className={styles.providersList}>
                                        {srv.providerDetails.map((provider, idx) => (
                                            <div className={styles.providerCard} key={idx}>
                                                <div className={styles.providerHeader}>
                                                    <div className={styles.providerName}>
                                                        <span style={{ color: "#888", fontSize: "16px" }}>●</span> {provider.name}
                                                        <a href="#" style={{ color: "#94a3b8" }} onClick={e => e.preventDefault()}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                                        </a>
                                                    </div>
                                                    <div className={styles.providerActions}>
                                                        <button className={styles.providerConnectBtn} onClick={(e) => { e.stopPropagation(); handleConnectClick(srv, provider); }}>Use Skill</button>
                                                        {srv.id === "llm" && (
                                                            <a
                                                                href="https://docs.aporto.tech"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={styles.modelsBtn}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                Models
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className={styles.providerDesc}>{provider.description}</div>
                                                <div className={styles.providerPricingDivider}></div>
                                                <div className={styles.pricingTitle}>Pricing</div>
                                                {Object.entries(provider.pricing).map(([k, v]) => (
                                                    <div className={styles.pricingRow} key={k}>
                                                        <span className={styles.pricingLabel}>{k}</span>
                                                        <span className={styles.pricingValue}>{String(v)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Connect Modal */}
            {showModal && (
                <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalHeaderLeft}>
                                <div className={styles.stepBadge}>+</div>
                                <h2 className={styles.headerTitle}>Add a Skill</h2>
                            </div>
                            <div className={styles.stepIndicator}>
                                <span style={{ color: "#00dc82" }}>●</span> <span style={{ color: "#555" }}>● ● ●</span> Step 2 of 5: API Routing
                            </div>
                            <button className={styles.closeButton} onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        <div className={styles.modalBody}>
                            <h3 className={styles.modalTitle}>Use {selectedProvider?.name} ({selectedService?.title})</h3>
                            <p className={styles.modalSubtitle}>Call the skill through Aporto. Your API key is pre-filled.</p>

                            <div className={styles.apiKeyBox}>
                                <div className={styles.apiKeyHeader}>
                                    <span>Your API Key</span>
                                    <button className={styles.copyBtn} onClick={() => handleCopy("key", apiKey)}>
                                        {copySuccess.key ? "✓ Copied" : "📋 Copy"}
                                    </button>
                                </div>
                                <div className={styles.apiKeyText}>{apiKey}</div>
                            </div>

                            <div className={styles.codeBox}>
                                <div className={styles.codeHeader}>
                                    <div className={styles.windowControls}>
                                        <div className={`${styles.controlDot} ${styles.dotRed}`}></div>
                                        <div className={`${styles.controlDot} ${styles.dotYellow}`}></div>
                                        <div className={`${styles.controlDot} ${styles.dotGreen}`}></div>
                                    </div>
                                    <div className={styles.fileName}>aporto-skill.js</div>
                                    <div className={styles.codeTabs}>
                                        <button
                                            className={`${styles.codeTab} ${codeTab === "Axios" ? styles.active : ""}`}
                                            onClick={() => setCodeTab("Axios")}
                                        >
                                            Axios
                                        </button>
                                        <button
                                            className={`${styles.codeTab} ${codeTab === "Fetch" ? styles.active : ""}`}
                                            onClick={() => setCodeTab("Fetch")}
                                        >
                                            Fetch
                                        </button>
                                        <button className={styles.copyBtn} onClick={() => handleCopy("code", codeTab === "Axios" ? getAxiosCode().replace(/<[^>]+>/g, '') : getFetchCode().replace(/<[^>]+>/g, ''))}>
                                            {copySuccess.code ? "✓ Copied" : "📋 Copy"}
                                        </button>
                                    </div>
                                </div>
                                <pre
                                    className={styles.codeContent}
                                    dangerouslySetInnerHTML={{ __html: codeTab === "Axios" ? getAxiosCode() : getFetchCode() }}
                                />
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button className={styles.backBtn} onClick={() => setShowModal(false)}>
                                ← Back
                            </button>
                            <button className={styles.doneBtn} onClick={() => setShowModal(false)}>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddServiceModal && (
                <AddServiceModal
                    apiKey={apiKey}
                    onClose={() => setShowAddServiceModal(false)}
                    provider={selectedProvider ?? undefined}
                />
            )}
        </DashboardLayout>
    );
}
