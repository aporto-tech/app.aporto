"use client";

import React, { useState, useEffect } from "react";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./services.module.css";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const SERVICES = [
    {
        id: "sms", icon: "💬", title: "SMS Verification", desc: "Phone number verification and OTP delivery", providers: 1,
        providerDetails: [{ name: "Prelude", description: "Phone verification", pricing: { "Send verification": "$0.015", "Check code": "Free" }, path: "/v1/sms/send", method: "POST", sampleBody: { to: "+1234567890", code: "123456" } }]
    },
    {
        id: "llm", icon: "🤖", title: "LLM Inference", desc: "Access to 400+ language models via unified API", providers: 1,
        providerDetails: [{ name: "OpenRouter", description: "Unified LLM API", pricing: { "Per Token": "Varies" }, path: "/v1/chat/completions", method: "POST", sampleBody: { model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "Hello from Service Hub!" }] } }]
    },
    {
        id: "search", icon: "🔍", title: "AI Search", desc: "Real-time web search and information retrieval", providers: 2,
        providerDetails: [
            { name: "Linkup", description: "AI web search", pricing: { "Standard depth": "$0.006", "Deep depth": "$0.055" }, path: "/v1/search/linkup", method: "POST", sampleBody: { query: "Latest AI news" } },
            { name: "You.com", description: "Real-time AI search", pricing: { "Web search": "$0.006", "Extended search": "$0.008", "URL content": "$0.01/request" }, path: "/v1/search/you", method: "POST", sampleBody: { query: "Machine learning" } }
        ]
    },
    {
        id: "audio", icon: "🔊", title: "Audio", desc: "AI voice synthesis and transcription", providers: 1,
        providerDetails: [{ name: "ElevenLabs", description: "AI audio synthesis", pricing: { "Text-to-speech": "$0.24/1K chars", "Speech-to-text": "$0.08/min", "Sound effects": "$0.08" }, path: "/v1/audio/speech", method: "POST", sampleBody: { text: "Hello world!", voice_id: "21m00Tcm4TlvDq8ikWAM" } }]
    },
    {
        id: "image", icon: "🖼️", title: "Image Generation", desc: "AI-powered image creation and editing", providers: 1,
        providerDetails: [{ name: "Fal.ai", description: "AI image generation", pricing: { "FLUX Dev": "$0.015/MP", "FLUX Schnell": "$0.004/MP", "FLUX Pro": "$0.04/MP" }, path: "/v1/images/generate", method: "POST", sampleBody: { prompt: "A futuristic city", model: "flux-dev" } }]
    },
    {
        id: "web", icon: "🌐", title: "Web Automation", desc: "Headless browser and web scraping", providers: 1,
        providerDetails: [{ name: "Anchor Browser", description: "Headless browser", pricing: { "Extract content": "$0.02", "Screenshot": "$0.02", "AI task": "$0.05 + $0.02/step" }, path: "/v1/browser/session", method: "POST", sampleBody: { url: "https://example.com" } }]
    },
    {
        id: "compute", icon: "📦", title: "Compute", desc: "Serverless sandboxes and agent hosting", providers: 1,
        providerDetails: [{ name: "Blaxel", description: "Run code, deploy sandboxes,\nand execute scripts in cloud environments", pricing: { "Run code (XS, 30s)": "$0.0007", "Deploy sandbox (S, 24h)": "$3.97", "Create sandbox (S, 4h)": "$0.66", "Exec command": "$0.00001" }, path: "/v1/sandbox/create", method: "POST", sampleBody: { action: "run" } }]
    },
    {
        id: "messaging", icon: "⚡", title: "Messaging", desc: "Serverless message queuing and scheduling", providers: 1,
        providerDetails: [{ name: "Upstash QStash", description: "Message queuing", pricing: { "Per message": "$0.0001" }, path: "/v1/messaging/publish", method: "POST", sampleBody: { topic: "updates", message: "Hello!" } }]
    },
    {
        id: "db", icon: "🗄️", title: "Databases", desc: "Managed databases — Redis, Vector, and Search", providers: 3,
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
    const [selectedService, setSelectedService] = useState<any>(null);
    const [selectedProvider, setSelectedProvider] = useState<any>(null);
    const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
    const [codeTab, setCodeTab] = useState<"Fetch" | "Axios">("Fetch");
    const [copySuccess, setCopySuccess] = useState({ key: false, code: false });

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        } else if (status === "authenticated") {
            // Fetch an API key to display in the modal
            fetch("/api/newapi/keys").then(r => r.json()).then(data => {
                if (data.success && data.tokens && data.tokens.length > 0) {
                    // Provide the full usable key so the Copy button works correctly!
                    setApiKey(`sk-live-${data.tokens[0].key}`);
                } else {
                    setApiKey("sk-live-CREATE_API_KEY_FIRST");
                }
            }).catch(() => { });
        }
    }, [status, router]);

    const handleConnectClick = (service: any, provider: any) => {
        setSelectedService(service);
        setSelectedProvider(provider);
        setShowModal(true);
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
<span class="${styles.comment}">// Example using standard Fetch API for Aporto API Base Routing</span>
<span class="${styles.keyword}">const</span> <span class="${styles.function}">APORTO_API_KEY</span> = <span class="${styles.string}">'${apiKey}'</span>;

<span class="${styles.keyword}">async function</span> <span class="${styles.function}">runService</span>() {
  <span class="${styles.keyword}">const</span> response = <span class="${styles.keyword}">await</span> <span class="${styles.function}">fetch</span>(<span class="${styles.string}">\`https://api.aporto.tech\${<span class="${styles.string}">'${selectedProvider.path}'</span>}\`</span>, {
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
  baseURL: <span class="${styles.string}">'https://api.aporto.tech'</span>,
  headers: {
    <span class="${styles.string}">'Authorization'</span>: <span class="${styles.string}">\`Bearer \${APORTO_API_KEY}\`</span>
  }
});

<span class="${styles.keyword}">async function</span> <span class="${styles.function}">runService</span>() {
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
                            ⚡ Service Hub
                        </div>
                        <h1 className={styles.headerTitle}>Paid Services, One API</h1>
                        <p className={styles.headerDesc}>
                            Instant access to search, communications, inference, and more.<br />
                            Built-in metering and governance keeps your agents safe.
                        </p>
                    </div>

                    <div className={styles.headerWidgets}>
                        <div className={styles.widgetBox}>
                            <div className={styles.widgetLabel}>Balance</div>
                            <div className={styles.widgetValue}>$5.00</div>
                            <div className={styles.widgetSub}>Available</div>
                        </div>
                        <div className={styles.widgetBox}>
                            <div className={styles.widgetLabel}>Governance</div>
                            <div className={styles.widgetValue} style={{ fontSize: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
                                ⚠️ No Services
                            </div>
                            <div className={styles.widgetSub}>Connect a service to start</div>
                        </div>
                    </div>
                </div>

                {/* Services List */}
                <div className={styles.serviceList}>
                    {SERVICES.map((srv) => (
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
                                    <button className={styles.connectBtn}>
                                        Connect
                                    </button>
                                    <div className={styles.providerCount}>
                                        {srv.providers} provider{srv.providers > 1 ? "s" : ""}
                                        <span style={{ transform: expandedServiceId === srv.id ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s" }}>⌄</span>
                                    </div>
                                </div>
                            </div>

                            <div className={`${styles.providersContainer} ${expandedServiceId === srv.id ? styles.expanded : ""}`}>
                                <div className={styles.providersInner}>
                                    <div className={styles.providersList}>
                                        {srv.providerDetails.map((provider: any, idx: number) => (
                                            <div className={styles.providerCard} key={idx}>
                                                <div className={styles.providerHeader}>
                                                    <div className={styles.providerName}>
                                                        <span style={{ color: "#888", fontSize: "16px" }}>●</span> {provider.name}
                                                        <a href="#" style={{ color: "#94a3b8" }} onClick={e => e.preventDefault()}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                                        </a>
                                                    </div>
                                                    <button className={styles.providerConnectBtn} onClick={(e) => { e.stopPropagation(); handleConnectClick(srv, provider); }}>Connect</button>
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
                                <h2 className={styles.headerTitle}>Add a Service</h2>
                            </div>
                            <div className={styles.stepIndicator}>
                                <span style={{ color: "#00dc82" }}>●</span> <span style={{ color: "#555" }}>● ● ●</span> Step 2 of 5: API Routing
                            </div>
                            <button className={styles.closeButton} onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        <div className={styles.modalBody}>
                            <h3 className={styles.modalTitle}>Connect to {selectedProvider?.name} ({selectedService?.title})</h3>
                            <p className={styles.modalSubtitle}>Use our proxy to send requests. Your API key is pre-filled.</p>

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
                                    <div className={styles.fileName}>api-routing.js</div>
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
                                I've Added the Code →
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
