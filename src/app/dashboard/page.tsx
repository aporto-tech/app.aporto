"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "../components/DashboardLayout";
import AddFundsModal from "../components/AddFundsModal";
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
    const { data: session, status } = useSession();
    const router = useRouter();

    // UI state
    const [activeTab, setActiveTab] = useState<"gettingStarted" | "analytics">("gettingStarted");
    const [activeRulesCount, setActiveRulesCount] = useState(0);

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

    // Logs state for Recent Activity
    const [recentLogs, setRecentLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState(true);

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
        const interval = setInterval(fetchBalance, 60_000);
        return () => clearInterval(interval);
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
    }, [status]);

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
                    const activeRules = data.tokens.filter((t: any) => t.remain_quota > 0 || !t.unlimited_quota);
                    setActiveRulesCount(activeRules.length);
                    if (activeRules.length > 0) {
                        setIsRuleCreated(true);
                    }
                }
            } catch {
                // silently fail
            }
        };
        fetchKeys();
    }, [status]);

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
            completed: false,
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
                {/* Services Hub Banner */}
                <div className={styles.servicesHub} style={{ marginBottom: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{
                            width: 44, height: 44, background: "rgba(0,220,130,0.15)",
                            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 20, color: "#00dc82",
                        }}>⚡</div>
                        <div className={styles.hubContent}>
                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                                Services Hub
                                <span className={styles.hubBadge}>12 services</span>
                            </h2>
                            <p style={{ margin: 0, color: "#888888", fontSize: 13, marginTop: 4 }}>
                                Search, SMS, Email, Inference, Image Gen &amp; more — one API, built-in metering
                            </p>
                        </div>
                    </div>
                    <Link href="/services" className={styles.exploreLink} style={{ whiteSpace: "nowrap" }}>
                        Explore Services →
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
                                                else if (item.num === 2) openRuleModal();
                                                else alert(`${item.title} – coming soon!`);
                                            }}
                                        >
                                            {item.action}
                                        </button>
                                    )}
                                </div>
                            ))}

                            {/* Tab switcher */}
                            <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
                                <div style={{ display: "flex", background: "#1a1a1a", borderRadius: 9999, padding: 4, gap: 4 }}>
                                    {(["gettingStarted", "analytics"] as const).map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
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
                                <div style={{
                                    background: "rgba(255,255,255,0.05)",
                                    borderRadius: 6,
                                    height: 36,
                                    width: 110,
                                    marginBottom: 16,
                                    animation: "pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite",
                                }} />
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
                                    onClick={openRuleModal}
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
                                <div style={{ padding: "20px", textAlign: "center", color: "#888", fontSize: 13 }}>Loading...</div>
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
