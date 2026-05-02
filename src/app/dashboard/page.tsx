"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "../components/DashboardLayout";
import AddFundsModal from "../components/AddFundsModal";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import styles from "../dashboard.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
    num: number;
    title: string;
    desc: string;
    action: string | null;
    completed: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const { data: session, status, update } = useSession();

    // Force-refresh session on mount so newApiUserId is always populated
    useEffect(() => { update(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const router = useRouter();

    // UI state
    const [activeTab, setActiveTab] = useState<"gettingStarted" | "analytics">(() => {
        if (typeof window !== "undefined") {
            return (localStorage.getItem("dashboard_tab") as "gettingStarted" | "analytics") ?? "gettingStarted";
        }
        return "gettingStarted";
    });

    const switchTab = (tab: "gettingStarted" | "analytics") => {
        setActiveTab(tab);
        if (tab === "analytics") {
            localStorage.setItem("dashboard_tab", "analytics");
        } else {
            localStorage.removeItem("dashboard_tab");
        }
    };
    const [timeRange, setTimeRange] = useState("24h");
    const [activeRulesCount, setActiveRulesCount] = useState(0);
    const [dashboardRulesLoaded, setDashboardRulesLoaded] = useState(false);

    // Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showKeyCreatedModal, setShowKeyCreatedModal] = useState(false);
    const [showAddFundsModal, setShowAddFundsModal] = useState(false);

    // Form state
    const [newKeyName, setNewKeyName] = useState("My API Key");
    const [newKeyDescription, setNewKeyDescription] = useState("");

    // Result state
    const [generatedKey, setGeneratedKey] = useState("");
    const [isApiKeyCreated, setIsApiKeyCreated] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [isCreatingKey, setIsCreatingKey] = useState(false);
    const [createKeyError, setCreateKeyError] = useState("");
    const [isFirstTransactionCompleted, setIsFirstTransactionCompleted] = useState(false);
    const [isPaymentMethodAdded, setIsPaymentMethodAdded] = useState(false);

    // Rule Modal state
    const [userKeys, setUserKeys] = useState<any[]>([]);
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [ruleLimitType, setRuleLimitType] = useState<"spending" | "usage">("spending");
    const [ruleSelectedKeyId, setRuleSelectedKeyId] = useState<string>("");
    const [ruleLimitAmount, setRuleLimitAmount] = useState("");
    const [ruleTimePeriod, setRuleTimePeriod] = useState("Per Run");
    const [ruleName, setRuleName] = useState("Global Spending Limit");
    const [isCreatingRule, setIsCreatingRule] = useState(false);
    const [createRuleError, setCreateRuleError] = useState("");
    const [isRuleCreated, setIsRuleCreated] = useState(false);

    // Balance state (from New-API)
    const [balance, setBalance] = useState<{ remainingUSD: number; usedUSD: number } | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(true);

    // Publisher status — for the "Earn with Aporto" CTA
    const [dashPubStatus, setDashPubStatus] = useState<string>("loading");

    // Logs state for Recent Activity
    const [recentLogs, setRecentLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState(true);

    // Analytics state
    const [analyticsLogs, setAnalyticsLogs] = useState<any[]>([]);
    const [analyticsTotal, setAnalyticsTotal] = useState(0);
    const [analyticsTotalCost, setAnalyticsTotalCost] = useState(0);
    const [analyticsTotalTokens, setAnalyticsTotalTokens] = useState(0);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [analyticsAgent, setAnalyticsAgent] = useState("All Agents");
    const [analyticsAgents, setAnalyticsAgents] = useState<string[]>([]);

    // Chart state — always 30-day window, independent of timeRange filter
    const [chartLogs, setChartLogs] = useState<any[]>([]);
    const [chartLoading, setChartLoading] = useState(false);
    const [tooltip, setTooltip] = useState<{ model: string; count: number; cost: number; x: number; y: number } | null>(null);

    // ─── Auth redirect ───────────────────────────────────────────────────────
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    // ─── Fetch balance from New-API ──────────────────────────────────────────
    useEffect(() => {
        if (status !== "authenticated") return;
        const fetchBalance = async () => {
            setBalanceLoading(true);
            try {
                const res = await fetch("/api/newapi/balance", { cache: "no-store" });
                const data = await res.json() as { success: boolean; remainingUSD?: number; usedUSD?: number };
                if (data.success) {
                    setBalance({ remainingUSD: data.remainingUSD ?? 0, usedUSD: data.usedUSD ?? 0 });
                }
            } catch {
                // silently fail
            } finally {
                setBalanceLoading(false);
            }
        };
        fetchBalance();
    }, [status, session]);

    // ─── Fetch publisher status for dashboard CTA ─────────────────────────────
    useEffect(() => {
        if (status !== "authenticated") return;
        fetch("/api/publisher/status")
            .then(r => r.ok ? r.json() : { status: "none" })
            .then((d: { status: string }) => setDashPubStatus(d.status))
            .catch(() => setDashPubStatus("none"));
    }, [status]);

    // ─── Fetch recent logs ───────────────────────────────────────────────────
    useEffect(() => {
        if (status !== "authenticated") return;
        const fetchLogs = async () => {
            setLogsLoading(true);
            try {
                const res = await fetch("/api/newapi/logs?page=0&size=5", { cache: "no-store" });
                const data = await res.json();
                if (data.success && data.logs) {
                    setRecentLogs(data.logs);
                    if (data.logs.length > 0) {
                        setIsFirstTransactionCompleted(true);
                    }
                }
            } catch {
                // silently fail
            } finally {
                setLogsLoading(false);
            }
        };
        fetchLogs();
    }, [status, session]);

    // ─── Fetch analytics logs when analytics tab opens ───────────────────────
    useEffect(() => {
        if (status !== "authenticated" || activeTab !== "analytics") return;
        setAnalyticsLoading(true);
        const rangeSeconds: Record<string, number> = { "1h": 3600, "24h": 86400, "7d": 604800, "30d": 2592000 };
        const since = Math.floor(Date.now() / 1000) - (rangeSeconds[timeRange] ?? 86400);
        const params = new URLSearchParams({ page: "0", size: "500", start_date: String(since) });
        if (analyticsAgent !== "All Agents") params.append("token_name", analyticsAgent);
        fetch(`/api/newapi/logs?${params.toString()}`, { cache: "no-store" })
            .then(r => r.json())
            .then(d => { if (d.success) { setAnalyticsLogs(d.logs ?? []); setAnalyticsTotal(d.total ?? 0); setAnalyticsTotalCost(d.totalCostUSD ?? 0); setAnalyticsTotalTokens(d.totalTokens ?? 0); } })
            .catch(() => {})
            .finally(() => setAnalyticsLoading(false));
    }, [status, activeTab, timeRange, analyticsAgent]);

    // ─── Fetch filter options when analytics tab opens ────────────────────────
    useEffect(() => {
        if (status !== "authenticated" || activeTab !== "analytics") return;
        fetch("/api/newapi/filters")
            .then(r => r.json())
            .then(d => { if (d.success) setAnalyticsAgents(d.tokens ?? []); })
            .catch(() => {});
    }, [status, activeTab]);

    // ─── Fetch 30-day chart data (always fixed 30d, ignores timeRange) ────────
    useEffect(() => {
        if (status !== "authenticated" || activeTab !== "analytics") return;
        setChartLoading(true);
        const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
        const params = new URLSearchParams({ page: "0", size: "2000", start_date: String(since) });
        if (analyticsAgent !== "All Agents") params.append("token_name", analyticsAgent);
        fetch(`/api/newapi/logs?${params.toString()}`, { cache: "no-store" })
            .then(r => r.json())
            .then(d => { if (d.success) setChartLogs(d.logs ?? []); })
            .catch(() => {})
            .finally(() => setChartLoading(false));
    }, [status, activeTab, analyticsAgent]);

    // ─── Fetch keys to persist "Getting Started" checklist ───────────────────
    useEffect(() => {
        if (status !== "authenticated") return;
        const fetchKeys = async () => {
            try {
                const res = await fetch("/api/newapi/keys", { cache: "no-store" });
                const data = await res.json() as { success: boolean; tokens?: any[] };
                if (data.success && data.tokens) {
                    setUserKeys(data.tokens);
                    if (data.tokens.length > 0) {
                        setIsApiKeyCreated(true);
                    }
                }
            } catch {
                // silently fail
            }
        };
        fetchKeys();
    }, [status, session]);

    // ─── Fetch rules for Governance widget + Getting Started checklist ────────
    useEffect(() => {
        if (status !== "authenticated") return;
        fetch("/api/rules", { cache: "no-store" })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    const count = (d.rules ?? []).length;
                    setActiveRulesCount(count);
                    if (count > 0) setIsRuleCreated(true);
                }
            })
            .catch(() => {})
            .finally(() => setDashboardRulesLoaded(true));
    }, [status, session]);

    // ─── Check if payment method is saved (saved card or past top-up) ─────────
    useEffect(() => {
        if (status !== "authenticated") return;
        fetch("/api/payments/stripe/saved-method")
            .then(r => r.json())
            .then(d => { if (d.success && d.hasSavedCard) setIsPaymentMethodAdded(true); })
            .catch(() => {});
    }, [status, session]);

    // ─── Close modal on Escape ───────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setShowCreateModal(false);
                setShowKeyCreatedModal(false);
                setShowRuleModal(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    // ─── Handlers ────────────────────────────────────────────────────────────

    const openCreateModal = useCallback(() => {
        setNewKeyName("My API Key");
        setNewKeyDescription("");
        setShowCreateModal(true);
        const mp = (window as any).mixpanel;
        if (mp) mp.track("api_key_create_modal_opened", { source: "dashboard" });
    }, []);

    const handleCreateKey = useCallback(async () => {
        if (!newKeyName.trim()) return;
        setIsCreatingKey(true);
        setCreateKeyError("");
        try {
            const res = await fetch("/api/newapi/create-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newKeyName.trim(), description: newKeyDescription }),
            });
            const data = await res.json() as { success: boolean; key?: string; message?: string };
            if (!data.success || !data.key) {
                setCreateKeyError(data.message ?? "Failed to create key. Check NEWAPI_ADMIN_TOKEN in .env.local.");
                return;
            }
            setGeneratedKey(data.key);
            setIsApiKeyCreated(true);
            setShowCreateModal(false);
            setShowKeyCreatedModal(true);
            const mp = (window as any).mixpanel;
            if (mp) {
                mp.track("api_key_created", { key_name: newKeyName.trim() });
                mp.track("onboarding_step_completed", { step: 1, step_name: "create_api_key" });
            }
        } catch (err) {
            setCreateKeyError(`Network error: ${String(err)}`);
        } finally {
            setIsCreatingKey(false);
        }
    }, [newKeyName, newKeyDescription]);

    const openRuleModal = useCallback(() => {
        setRuleLimitType("spending");
        if (userKeys.length > 0) {
            setRuleSelectedKeyId(String(userKeys[0].id));
        } else {
            setRuleSelectedKeyId("");
        }
        setRuleLimitAmount("");
        setRuleTimePeriod("Per Run");
        setRuleName("Global Spending Limit");
        setCreateRuleError("");
        setShowRuleModal(true);
        const mp = (window as any).mixpanel;
        if (mp) mp.track("rule_create_modal_opened", { source: "dashboard" });
    }, [userKeys]);

    const handleCreateRule = useCallback(async () => {
        if (!ruleSelectedKeyId) {
            setCreateRuleError("Please select an API key.");
            return;
        }
        if (!ruleLimitAmount || isNaN(Number(ruleLimitAmount)) || Number(ruleLimitAmount) <= 0) {
            setCreateRuleError("Please enter a valid positive amount.");
            return;
        }

        setIsCreatingRule(true);
        setCreateRuleError("");
        try {
            const selectedKey = userKeys.find(k => String(k.id) === ruleSelectedKeyId);
            if (!selectedKey) throw new Error("Key not found");

            // remain_quota calculation: $1 = 500,000 quota in New-API
            let quotaToSets = 0;
            if (ruleLimitType === "spending") {
                quotaToSets = Math.floor(Number(ruleLimitAmount) * 500000);
            } else {
                quotaToSets = Number(ruleLimitAmount);
            }

            const res = await fetch("/api/newapi/keys", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tokenId: Number(ruleSelectedKeyId),
                    name: selectedKey.name,
                    remain_quota: quotaToSets,
                    unlimited_quota: false
                }),
            });
            const data = await res.json();
            if (!data.success) {
                setCreateRuleError(data.message ?? "Failed to save rule settings.");
                return;
            }

            setIsRuleCreated(true);
            setShowRuleModal(false);
            const mp = (window as any).mixpanel;
            if (mp) {
                mp.track("rule_created", {
                    rule_type: ruleLimitType,
                    limit_amount: Number(ruleLimitAmount),
                    key_name: userKeys.find(k => String(k.id) === ruleSelectedKeyId)?.name ?? null,
                });
                mp.track("onboarding_step_completed", { step: 2, step_name: "create_spending_rule" });
            }

            // refresh keys
            const keysRes = await fetch("/api/newapi/keys", { cache: "no-store" });
            const keysData = await keysRes.json();
            if (keysData.success && keysData.tokens) {
                setUserKeys(keysData.tokens);
            }
        } catch (err) {
            setCreateRuleError(`Error: ${String(err)}`);
        } finally {
            setIsCreatingRule(false);
        }
    }, [ruleSelectedKeyId, ruleLimitAmount, ruleLimitType, userKeys]);

    const handleCopyKey = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(generatedKey);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch {
            // Fallback for environments without clipboard API
            const el = document.createElement("textarea");
            el.value = generatedKey;
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        }
    }, [generatedKey]);

    const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            setShowCreateModal(false);
            setShowKeyCreatedModal(false);
            setShowRuleModal(false);
        }
    }, []);

    // ─── Data ────────────────────────────────────────────────────────────────

    const checklistItems: ChecklistItem[] = [
        {
            num: 1,
            title: "Create API Key",
            desc: "Your agents use this to authenticate",
            action: "Create",
            completed: isApiKeyCreated,
        },
        {
            num: 2,
            title: "Create a Spending Rule",
            desc: "Protect your spend with automated limits",
            action: "Create",
            completed: isRuleCreated,
        },
        {
            num: 3,
            title: "First Transaction",
            desc: "Make your first API call through Aporto",
            action: null,
            completed: isFirstTransactionCompleted,
        },
        {
            num: 4,
            title: "Add Payment Method",
            desc: "Continue after your $5 free credits",
            action: "Add",
            completed: isPaymentMethodAdded,
        },
    ];

    const completedCount = checklistItems.filter((item) => item.completed).length;

    // ─── Loading / auth guards ───────────────────────────────────────────────

    if (status === "loading") {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#000" }}>
                <div style={{ color: "#fff", fontSize: 18 }}>Loading...</div>
            </div>
        );
    }

    if (!session) return null;

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <>
            <DashboardLayout>
                {/* Skill Network Banner */}
                <div className={styles.servicesHub} style={{ marginBottom: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{
                            width: 44, height: 44, background: "rgba(0,220,130,0.15)",
                            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 20, color: "#00dc82",
                        }}>⚡</div>
                        <div className={styles.hubContent}>
                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                                AI Skill Network
                                <span className={styles.hubBadge}>1000+ skills</span>
                            </h2>
                            <p style={{ margin: 0, color: "#888888", fontSize: 13, marginTop: 4 }}>
                                One MCP router for scraping, search, AI, automation, and paid provider routing
                            </p>
                        </div>
                    </div>
                    <Link href="/services" className={styles.exploreLink} style={{ whiteSpace: "nowrap" }}>
                        Explore Skills →
                    </Link>
                </div>

                <div className={styles.dashboardGrid}>
                    {/* ── Main Column ─────────────────────────────────────── */}
                    <div className={styles.mainCol}>
                        {/* Welcome Card */}
                        <div className={styles.welcomeCard}>
                            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                                <div style={{
                                    width: 56, height: 56, background: "#00dc82",
                                    clipPath: "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)",
                                    flexShrink: 0,
                                }} />
                                <div className={styles.welcomeText}>
                                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Welcome to Aporto!</h1>
                                    <p style={{ margin: "8px 0 0", color: "#888", fontSize: 13, lineHeight: 1.5 }}>
                                        Complete the checklist below to get started. Switch to Analytics for your dashboard.
                                    </p>
                                </div>
                            </div>
                            <div className={styles.welcomeProgress}>
                                <div className={styles.progressValue}>{completedCount}/4</div>
                                <span className={styles.progressLabel}>complete</span>
                            </div>
                        </div>

                        {activeTab === "gettingStarted" && (<>
                        {/* Quick Actions */}
                        <div className={styles.checklistCard}>
                            <h3 className={styles.quickActionsHeader}>
                                <span style={{ color: "#f59e0b" }}>⚡</span> Quick Actions
                            </h3>
                            <div className={styles.actionGrid}>
                                <div className={styles.actionCard} role="button" tabIndex={0} onClick={() => alert("Interactive Guide coming soon!")}>
                                    <div className={styles.actionIcon} style={{ color: "#00dc82", background: "rgba(0,220,130,0.1)" }}>▷</div>
                                    <div className={styles.actionInfo}>
                                        <h3>Interactive Guide</h3>
                                        <p>Try Aporto in action</p>
                                    </div>
                                </div>
                                <div className={styles.actionCard} role="button" tabIndex={0} onClick={() => window.open("https://docs.aporto.tech", "_blank", "noopener,noreferrer")}>
                                    <div className={styles.actionIcon} style={{ color: "#60a5fa", background: "rgba(96,165,250,0.1)" }}>📖</div>
                                    <div className={styles.actionInfo}>
                                        <h3>View Documentation</h3>
                                        <p>Integration guides</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Getting Started Checklist */}
                        <div className={styles.checklistCard}>
                            <div className={styles.checklistHeader}>
                                <h3>
                                    <span style={{ color: "#00dc82", marginRight: 8 }}>✓</span>
                                    Getting Started
                                </h3>
                                <span style={{ color: "#666", fontSize: 13 }}>{completedCount} of 4 complete</span>
                            </div>

                            {checklistItems.map((item) => (
                                <div
                                    key={item.num}
                                    className={`${styles.checklistItem} ${item.completed ? styles.itemCompleted : ""}`}
                                >
                                    <div className={styles.itemInfo}>
                                        <div className={`${styles.itemNumber} ${item.completed ? styles.itemNumberCompleted : ""}`}>
                                            {item.completed ? "✓" : item.num}
                                        </div>
                                        <div className={`${styles.itemText} ${item.completed ? styles.itemTextCompleted : ""}`}>
                                            <h4>{item.title}</h4>
                                            <p>{item.desc}</p>
                                        </div>
                                    </div>
                                    {item.action && !item.completed && (
                                        <button
                                            className={styles.itemButton}
                                            onClick={() => {
                                                if (item.num === 1) openCreateModal();
                                                else if (item.num === 2) router.push("/rules");
                                                else alert(`${item.title} – coming soon!`);
                                            }}
                                        >
                                            {item.action}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        </>)}

                        {/* Analytics Tab Content */}
                        {activeTab === "analytics" && (() => {
                            // Compute stats from logs
                            const totalRequests = analyticsTotal;
                            const totalCost = analyticsTotalCost;
                            const totalTokens = analyticsTotalTokens;
                            const modelCounts: Record<string, number> = {};
                            analyticsLogs.forEach(l => { if (l.model_name) modelCounts[l.model_name] = (modelCounts[l.model_name] ?? 0) + 1; });
                            const topModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

                            // Group by day (ISO key = YYYY-MM-DD) for per-model stacked bar chart
                            const MODEL_COLORS = ["#00dc82", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
                            const chartDayMap: Record<string, Record<string, { count: number; cost: number }>> = {};
                            chartLogs.forEach(l => {
                                const dayKey = new Date((l.created_at ?? 0) * 1000).toISOString().slice(0, 10);
                                if (!chartDayMap[dayKey]) chartDayMap[dayKey] = {};
                                const model = l.model_name ?? "unknown";
                                if (!chartDayMap[dayKey][model]) chartDayMap[dayKey][model] = { count: 0, cost: 0 };
                                chartDayMap[dayKey][model].count += 1;
                                chartDayMap[dayKey][model].cost += l.costUSD ?? 0;
                            });
                            const chartDaysArr = Object.keys(chartDayMap).sort(); // ISO sort = chronological
                            const maxDayTotal = Math.max(1, ...chartDaysArr.map(d =>
                                Object.values(chartDayMap[d]).reduce((s, v) => s + v.count, 0)
                            ));
                            const chartAllModels = [...new Set(chartLogs.map(l => l.model_name).filter(Boolean))].sort() as string[];
                            const modelColorMap: Record<string, string> = {};
                            chartAllModels.forEach((m, i) => { modelColorMap[m] = MODEL_COLORS[i % MODEL_COLORS.length]; });

                            const statCard = (label: string, value: string, sub?: string) => (
                                <div style={{ background: "#0d1117", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px 20px" }}>
                                    <div style={{ fontSize: 11, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>{value}</div>
                                    {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{sub}</div>}
                                </div>
                            );

                            return (
                                <div>
                                    {/* Filters row: time range + agent */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
                                        {analyticsAgents.length > 0 && (
                                            <select
                                                value={analyticsAgent}
                                                onChange={e => setAnalyticsAgent(e.target.value)}
                                                style={{
                                                    background: "#1a1a1a", border: "1px solid #333", color: "#ccc",
                                                    borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer",
                                                }}
                                            >
                                                <option value="All Agents">All Agents</option>
                                                {analyticsAgents.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        )}
                                        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                                            {(["1h", "24h", "7d", "30d"] as const).map((r) => (
                                                <button key={r} onClick={() => setTimeRange(r)} style={{
                                                    background: timeRange === r ? "#00dc82" : "#1a1a1a",
                                                    color: timeRange === r ? "#000" : "#888",
                                                    border: "none", borderRadius: 6, padding: "5px 12px",
                                                    fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                                                }}>{r}</button>
                                            ))}
                                        </div>
                                    </div>

                                    {analyticsLoading ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                                                {[0,1,2,3].map(i => <Skeleton key={i} height={80} />)}
                                            </div>
                                            <Skeleton height={180} />
                                            <Skeleton height={120} />
                                        </div>
                                    ) : totalRequests === 0 ? (
                                        <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
                                            <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                                            <div style={{ fontSize: 15, fontWeight: 600, color: "#666" }}>No data for this period</div>
                                            <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>Make your first API request to see analytics here</div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Stat cards */}
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
                                                {statCard("Requests", totalRequests.toLocaleString())}
                                                {statCard("Total Cost", `$${totalCost.toFixed(4)}`)}
                                                {statCard("Total Tokens", totalTokens.toLocaleString())}
                                                {statCard("Top Model", topModel.split("/").pop() ?? topModel)}
                                            </div>

                                            {/* Stacked bar chart — always 30-day window */}
                                            {chartDaysArr.length > 0 && (
                                                <div style={{ background: "#0d1117", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px 20px", marginBottom: 14, position: "relative" }}>
                                                    <div style={{ fontSize: 12, color: "#555", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.05em" }}>Requests over time · last 30 days</div>
                                                    {/* Tooltip */}
                                                    {tooltip && (
                                                        <div style={{
                                                            position: "fixed", left: tooltip.x + 10, top: tooltip.y - 10,
                                                            background: "#0d1117", border: "1px solid #333", borderRadius: 8,
                                                            padding: "8px 12px", fontSize: 12, color: "#e2e8f0", zIndex: 9999,
                                                            pointerEvents: "none", whiteSpace: "nowrap",
                                                            boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
                                                        }}>
                                                            <div style={{ fontWeight: 600, marginBottom: 3, color: modelColorMap[tooltip.model] ?? "#00dc82" }}>{tooltip.model.split("/").pop() ?? tooltip.model}</div>
                                                            <div style={{ color: "#888" }}>{tooltip.count} req · ${tooltip.cost.toFixed(4)}</div>
                                                        </div>
                                                    )}
                                                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 130, overflowX: "auto", paddingBottom: 2 }}>
                                                        {chartDaysArr.map(dayKey => {
                                                            const models = chartDayMap[dayKey];
                                                            const dayTotal = Object.values(models).reduce((s, v) => s + v.count, 0);
                                                            const barHeight = Math.max(4, (dayTotal / maxDayTotal) * 90);
                                                            const label = new Date(dayKey + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
                                                            const sortedModels = Object.entries(models).sort((a, b) => b[1].count - a[1].count);
                                                            return (
                                                                <div key={dayKey} style={{ minWidth: 26, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                                                                    <div style={{ fontSize: 9, color: "#555", height: 11, lineHeight: "11px" }}>{dayTotal}</div>
                                                                    <div style={{ width: "100%", height: barHeight, display: "flex", flexDirection: "column-reverse", borderRadius: "3px 3px 0 0", overflow: "hidden", flexShrink: 0 }}>
                                                                        {sortedModels.map(([model, { count, cost }]) => (
                                                                            <div
                                                                                key={model}
                                                                                style={{
                                                                                    width: "100%",
                                                                                    height: `${(count / dayTotal) * barHeight}px`,
                                                                                    background: modelColorMap[model] ?? "#00dc82",
                                                                                    cursor: "crosshair",
                                                                                    flexShrink: 0,
                                                                                }}
                                                                                onMouseEnter={e => setTooltip({ model, count, cost, x: e.clientX, y: e.clientY })}
                                                                                onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                                                                                onMouseLeave={() => setTooltip(null)}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                    <div style={{ fontSize: 9, color: "#444", whiteSpace: "nowrap" }}>{label}</div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    {/* Legend */}
                                                    {chartAllModels.length > 1 && (
                                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 12 }}>
                                                            {chartAllModels.map(m => (
                                                                <div key={m} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#666" }}>
                                                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: modelColorMap[m] ?? "#00dc82", flexShrink: 0 }} />
                                                                    {m.split("/").pop() ?? m}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Top models table */}
                                            <div style={{ background: "#0d1117", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px 20px" }}>
                                                <div style={{ fontSize: 12, color: "#555", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Models used</div>
                                                {Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([model, count]) => {
                                                    const cost = analyticsLogs.filter(l => l.model_name === model).reduce((s, l) => s + (l.costUSD ?? 0), 0);
                                                    return (
                                                        <div key={model} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #111" }}>
                                                            <div style={{ flex: 1, fontSize: 13, color: "#ccc" }}>{model}</div>
                                                            <div style={{ fontSize: 12, color: "#555", width: 70, textAlign: "right" }}>{count} req</div>
                                                            <div style={{ fontSize: 12, color: "#00dc82", width: 70, textAlign: "right" }}>${cost.toFixed(4)}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Tab switcher */}
                        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
                            <div style={{ display: "flex", background: "#1a1a1a", borderRadius: 9999, padding: 4, gap: 4 }}>
                                {(["gettingStarted", "analytics"] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => switchTab(tab)}
                                        style={{
                                            background: activeTab === tab ? "#00dc82" : "transparent",
                                            color: activeTab === tab ? "#000" : "#888",
                                            border: "none",
                                            borderRadius: 9999,
                                            padding: "8px 20px",
                                            fontSize: 13,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            transition: "all 0.2s",
                                            textTransform: "capitalize",
                                            }}
                                        >
                                            {tab === "gettingStarted" ? "Getting Started" : "Analytics"}
                                        </button>
                                    ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Right Column ────────────────────────────────────── */}
                    <div className={styles.rightCol}>
                        {/* Available Balance */}
                        <div className={styles.widget}>
                            <div className={styles.widgetHeader}>
                                <span>$ Available Balance</span>
                                {!balanceLoading && balance && (
                                    <span style={{ fontSize: 11, color: "#555", fontWeight: 400 }}>
                                        {balance.usedUSD.toFixed(4)} USD used
                                    </span>
                                )}
                            </div>
                            {balanceLoading ? (
                                <div style={{ marginBottom: 16 }}>
                                    <Skeleton width={110} height={36} style={{ marginBottom: 8 }} />
                                    <Skeleton width={80} height={13} />
                                </div>
                            ) : (
                                <div className={styles.balanceAmount}>
                                    ${balance?.remainingUSD.toFixed(4) ?? "0.0000"}
                                </div>
                            )}
                            <button className={styles.addFundsBtn} onClick={() => setShowAddFundsModal(true)}>
                                + Add Funds
                            </button>
                        </div>

                        {/* Governance */}
                        <div className={styles.widget}>
                            <div className={styles.widgetHeader}>
                                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ color: "#f59e0b" }}>🛡️</span> Governance
                                </span>
                                <button
                                    style={{ background: "none", border: "none", color: "#00dc82", cursor: "pointer", fontSize: 13 }}
                                    onClick={() => router.push("/rules")}
                                >
                                    + Add
                                </button>
                            </div>
                            <div className={styles.governanceText}>
                                {activeRulesCount} Rule{activeRulesCount !== 1 ? "s" : ""} Active
                            </div>
                            {activeRulesCount > 0 ? (
                                <div className={styles.statusIndicator} style={{ color: "#00dc82" }}>
                                    <span style={{ background: "rgba(0,220,130,0.1)", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✓</span>
                                    <span>Protected</span>
                                </div>
                            ) : (
                                <div className={styles.statusIndicator}>
                                    <span style={{ color: "#ef4444" }}>✕</span>
                                    <span style={{ color: "#ef4444" }}>Unprotected</span>
                                </div>
                            )}
                        </div>

                        {/* Recent Activity */}
                        <div className={styles.widget}>
                            <div className={styles.widgetHeader}>
                                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ color: "#00dc82" }}>〜</span> Recent Activity
                                </span>
                                <Link href="/activity" style={{ color: "#888", fontSize: 13, textDecoration: "none" }}>
                                    View All
                                </Link>
                            </div>
                            {logsLoading ? (
                                <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 2 }}>
                                    {[0,1,2].map(i => <SkeletonRow key={i} />)}
                                </div>
                            ) : recentLogs.length === 0 ? (
                                <div className={styles.noActivity}>
                                    <div style={{ fontSize: 32, marginBottom: 12, color: "#333" }}>〜</div>
                                    <div style={{ fontWeight: 500, marginBottom: 8 }}>No recent activity</div>
                                    <div style={{ fontSize: 12, lineHeight: 1.5, color: "#555", maxWidth: 160, margin: "0 auto" }}>
                                        Transactions will appear here once your agents start making requests
                                    </div>
                                </div>
                            ) : (
                                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: "8px" }}>
                                    {recentLogs.map((log: any) => {
                                        const isError = log.type === 2 && log.content !== "";
                                        const isConsume = log.type === 2 && !isError;
                                        const amountColor = isError ? "#ef4444" : isConsume ? "#00dc82" : (log.costUSD > 0 ? "#3b82f6" : "#888");
                                        const displaySign = log.type === 2 && log.costUSD > 0 ? "-" : (log.costUSD > 0 ? "+" : "");
                                        
                                        return (
                                            <div key={log.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                                                <div style={{ display: "flex", flexDirection: "column", gap: "4px", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    <span style={{ fontSize: "13px", fontWeight: 500, color: "#e2e8f0" }} className={styles.truncate}>
                                                        {log.model_name || (isError ? "Error" : "System")}
                                                    </span>
                                                    <span style={{ fontSize: "11px", color: "#888" }} className={styles.truncate}>
                                                        {log.token_name ? `🔑 ${log.token_name}` : (isError ? log.content : "No key")}
                                                    </span>
                                                </div>
                                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                                                    <span style={{ fontSize: "13px", fontWeight: 600, color: amountColor }}>
                                                        {displaySign}${log.costUSD.toFixed(4)}
                                                    </span>
                                                    {(log.prompt_tokens > 0 || log.completion_tokens > 0) && (
                                                        <span style={{ fontSize: "10px", color: "#666" }}>
                                                            {log.prompt_tokens + log.completion_tokens} tkns
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Earn with Aporto — CTA for non-publishers */}
                        {dashPubStatus === "none" && (
                            <div className={styles.widget} style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(0,220,130,0.06) 100%)", border: "1px solid rgba(99,102,241,0.2)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                                    <span style={{ fontSize: 20 }}>🏗️</span>
                                    <span style={{ fontWeight: 600, fontSize: 14, color: "#e2e8f0" }}>Earn with Aporto</span>
                                </div>
                                <p style={{ fontSize: 12, color: "#888", lineHeight: 1.6, marginBottom: 14 }}>
                                    Publish AI skills to the marketplace and earn revenue every time an agent calls your skill.
                                </p>
                                <Link
                                    href="/publisher"
                                    style={{ display: "inline-block", background: "#6366f1", color: "#fff", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 600, textDecoration: "none" }}
                                >
                                    Become a Publisher →
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </DashboardLayout>

            {/* ─── Modals rendered OUTSIDE DashboardLayout to avoid stacking context issues ─── */}
            
            {showAddFundsModal && (
                <AddFundsModal onClose={() => setShowAddFundsModal(false)} />
            )}

            {/* Create API Key Modal */}
            {showCreateModal && (
                <div className={styles.modalOverlay} onClick={handleOverlayClick}>
                    <div className={styles.modalContent} role="dialog" aria-modal="true" aria-labelledby="modal-title">
                        <div className={styles.modalHeader}>
                            <div className={styles.modalTitle}>
                                <div style={{ fontSize: 24 }}>🔑</div>
                                <div>
                                    <h2 id="modal-title">Create New API Key</h2>
                                    <p className={styles.modalSubtitle}>Create a new API key for programmatic access to your organization.</p>
                                </div>
                            </div>
                            <button className={styles.closeButton} onClick={() => setShowCreateModal(false)} aria-label="Close">✕</button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.formGroup}>
                                <label htmlFor="key-name">Name <span className={styles.required}>*</span></label>
                                <input
                                    id="key-name"
                                    className={styles.formInput}
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    placeholder="My API Key"
                                    autoFocus
                                />
                                <span className={styles.formHelpText}>A descriptive name to identify this key</span>
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="key-description">Description</label>
                                <textarea
                                    id="key-description"
                                    className={styles.formTextarea}
                                    rows={3}
                                    value={newKeyDescription}
                                    onChange={(e) => setNewKeyDescription(e.target.value)}
                                    placeholder="Used for production API access..."
                                />
                                <span className={styles.formHelpText}>Optional description for additional context</span>
                            </div>
                            {createKeyError && (
                                <div style={{
                                    background: "rgba(239,68,68,0.08)",
                                    border: "1px solid rgba(239,68,68,0.3)",
                                    borderRadius: 8,
                                    padding: "10px 14px",
                                    color: "#ef4444",
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                    marginTop: 8,
                                }}>
                                    ⚠️ {createKeyError}
                                </div>
                            )}
                        </div>

                        <div className={styles.modalFooter}>
                            <button className={styles.cancelButton} onClick={() => setShowCreateModal(false)} disabled={isCreatingKey}>Cancel</button>
                            <button
                                className={styles.createButton}
                                onClick={handleCreateKey}
                                disabled={!newKeyName.trim() || isCreatingKey}
                                style={{
                                    opacity: (newKeyName.trim() && !isCreatingKey) ? 1 : 0.5,
                                    cursor: (newKeyName.trim() && !isCreatingKey) ? "pointer" : "not-allowed",
                                    minWidth: 140,
                                }}
                            >
                                {isCreatingKey ? "Creating..." : "Create API Key"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add New Rule Modal */}
            {showRuleModal && (
                <div className={styles.modalOverlay} onClick={handleOverlayClick}>
                    <div className={styles.modalContentLarge} role="dialog" aria-modal="true" aria-labelledby="rule-modal-title">
                        <div className={styles.modalHeader} style={{ marginBottom: 0 }}>
                            <div>
                                <h2 id="rule-modal-title" style={{ fontSize: 20, margin: 0 }}>Add New Rule</h2>
                                <p className={styles.modalSubtitle} style={{ marginTop: 4 }}>
                                    Create a usage or spending limit. Automatically protect your balance.
                                </p>
                            </div>
                            <button className={styles.closeButton} onClick={() => setShowRuleModal(false)}>✕</button>
                        </div>

                        <div className={styles.ruleModalGrid}>
                            {/* Left Column: Form Settings */}
                            <div>
                                <div className={styles.ruleSectionTitle}>What do you want to limit?</div>

                                <div
                                    className={`${styles.ruleOptionCard} ${ruleLimitType === "spending" ? styles.selected : ""}`}
                                    onClick={() => setRuleLimitType("spending")}
                                >
                                    <div className={styles.ruleOptionIcon}></div>
                                    <div className={styles.ruleOptionText}>
                                        <h4><span style={{ color: "#00dc82" }}>$</span> Spending</h4>
                                        <p>Control how much money is spent<br />e.g. Max $500 per month</p>
                                    </div>
                                </div>

                                <div
                                    className={`${styles.ruleOptionCard} ${ruleLimitType === "usage" ? styles.selected : ""}`}
                                    onClick={() => setRuleLimitType("usage")}
                                >
                                    <div className={styles.ruleOptionIcon}></div>
                                    <div className={styles.ruleOptionText}>
                                        <h4><span style={{ color: "#00dc82" }}>📊</span> Usage</h4>
                                        <p>Control how many times it&apos;s used<br />e.g. Max 10,000 calls per day</p>
                                    </div>
                                </div>

                                <div className={styles.formGroup} style={{ marginTop: 24 }}>
                                    <label>TARGET API KEY*</label>
                                    <select
                                        className={styles.formSelect}
                                        value={ruleSelectedKeyId}
                                        onChange={(e) => setRuleSelectedKeyId(e.target.value)}
                                    >
                                        <option value="" disabled>Select an API Key...</option>
                                        {userKeys.map((k) => (
                                            <option key={k.id} value={k.id}>{k.name}</option>
                                        ))}
                                    </select>
                                    {userKeys.length === 0 && (
                                        <span className={styles.formHelpText} style={{ color: "#ef4444" }}>You must create an API key first!</span>
                                    )}
                                </div>

                                <div className={styles.formGroup}>
                                    <label>MAXIMUM AMOUNT*</label>
                                    <div className={styles.limitInputWrapper}>
                                        {ruleLimitType === "spending" && <span className={styles.limitCurrency}>$</span>}
                                        <input
                                            type="number"
                                            className={`${styles.formInput} ${ruleLimitType === "spending" ? styles.limitInput : ""}`}
                                            placeholder="0.00"
                                            value={ruleLimitAmount}
                                            onChange={(e) => setRuleLimitAmount(e.target.value)}
                                            step={ruleLimitType === "spending" ? "0.01" : "1"}
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label>TIME PERIOD*</label>
                                    <select
                                        className={styles.formSelect}
                                        value={ruleTimePeriod}
                                        onChange={(e) => setRuleTimePeriod(e.target.value)}
                                    >
                                        <option value="Per Run">Per Run (Total Quota)</option>
                                    </select>
                                    <span className={styles.formHelpText}>Aporto limits apply as total quota restrictions directly to the key.</span>
                                </div>

                                {createRuleError && (
                                    <div style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>
                                        ⚠️ {createRuleError}
                                    </div>
                                )}
                            </div>

                            {/* Right Column: Summary */}
                            <div>
                                <div className={styles.ruleSummaryBox}>
                                    <h3>Rule Summary</h3>

                                    <div className={styles.formGroup}>
                                        <label style={{ fontSize: 11, color: "#666", textTransform: "uppercase" }}>Name of Rule*</label>
                                        <input
                                            className={styles.formInput}
                                            value={ruleName}
                                            onChange={(e) => setRuleName(e.target.value)}
                                            placeholder="Global Spending Limit"
                                        />
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <div className={styles.summaryLabel}>Limit Type</div>
                                        <div className={styles.summaryValue}>
                                            {ruleLimitType === "spending" ? "Spending" : "Usage"}<br />
                                            <span style={{ fontSize: 13, color: "#888" }}>
                                                {ruleLimitType === "spending" ? "Control how much money is spent" : "Control how many times it's used"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <div className={styles.summaryLabel}>Time Period</div>
                                        <div className={styles.summaryValue}>{ruleTimePeriod}</div>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <div className={styles.summaryLabel}>Services</div>
                                        <div className={styles.summaryValue}>All services</div>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <div className={styles.summaryLabel}>Agents</div>
                                        <div className={styles.summaryValue}>All agents</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button className={styles.cancelButton} onClick={() => setShowRuleModal(false)} disabled={isCreatingRule}>Cancel</button>
                            <button
                                className={styles.createButton}
                                style={{ background: "#00dc82", color: "#000" }}
                                onClick={handleCreateRule}
                                disabled={isCreatingRule}
                            >
                                {isCreatingRule ? "Saving..." : "Create Rule"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* API Key Created Modal */}
            {showKeyCreatedModal && (
                <div className={styles.modalOverlay} onClick={handleOverlayClick}>
                    <div className={styles.modalContent} role="dialog" aria-modal="true" aria-labelledby="created-modal-title">
                        <div className={styles.modalHeader}>
                            <div className={styles.modalTitle}>
                                <div style={{ fontSize: 24 }}>🔑</div>
                                <div>
                                    <h2 id="created-modal-title">API Key Created</h2>
                                    <p className={styles.modalSubtitle}>Save this API key now. You won&apos;t be able to see it again.</p>
                                </div>
                            </div>
                        </div>

                        <div className={styles.modalBody}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: "50%",
                                    background: "rgba(0, 220, 130, 0.1)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "#00dc82", flexShrink: 0,
                                }}>✓</div>
                                <div>
                                    <div style={{ fontWeight: 600 }}>{newKeyName}</div>
                                    <div className={`${styles.statusBadge} ${styles.liveBadge}`}>LIVE</div>
                                </div>
                            </div>

                            <div style={{ color: "#888", fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                🛡️ Your API Key
                            </div>
                            <div className={styles.keyDisplayBox}>
                                <div className={styles.keyValue}>{generatedKey}</div>
                                <button className={styles.copyButton} onClick={handleCopyKey}>
                                    {copySuccess ? "✓ Copied!" : "📋 Copy"}
                                </button>
                            </div>

                            <div className={styles.warningBox}>
                                <span className={styles.warningIcon}>⚠️</span>
                                <p className={styles.warningText}>
                                    Store this key securely. For security reasons, it won&apos;t be shown again.
                                </p>
                            </div>
                        </div>

                        <div className={styles.modalFooter} style={{ borderTop: "none" }}>
                            <button
                                className={styles.createButton}
                                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                                onClick={() => setShowKeyCreatedModal(false)}
                            >
                                🔑 Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
