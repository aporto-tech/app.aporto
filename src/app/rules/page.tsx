"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./rules.module.css";

interface ApiToken {
    id: number;
    name: string;
    key: string;
    status: number;
}

interface Rule {
    id: string;
    tokenId: number;
    tokenName: string;
    type: string;
    limitUSD: number | null;
    models: string | null;
    enabled: boolean;
    createdAt: string;
    usedUSD: number;
    remainingUSD: number | null;
    currentModels: string;
}

type RuleType = "total_limit" | "daily_limit" | "model_allowlist";

const RULE_TYPE_LABELS: Record<RuleType, string> = {
    total_limit: "Total Budget",
    daily_limit: "Daily Limit",
    model_allowlist: "Model Allowlist",
};

export default function RulesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [rules, setRules] = useState<Rule[]>([]);
    const [tokens, setTokens] = useState<ApiToken[]>([]);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalStep, setModalStep] = useState<1 | 2 | 3>(1);
    const [selectedTokenId, setSelectedTokenId] = useState<number | "">("");
    const [selectedType, setSelectedType] = useState<RuleType>("total_limit");
    const [limitInput, setLimitInput] = useState("");
    const [selectedModels, setSelectedModels] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [modalError, setModalError] = useState("");

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [rulesRes, tokensRes, filtersRes] = await Promise.all([
                fetch("/api/rules", { cache: "no-store" }),
                fetch("/api/newapi/keys", { cache: "no-store" }),
                fetch("/api/newapi/filters", { cache: "no-store" }),
            ]);
            const [rulesData, tokensData, filtersData] = await Promise.all([
                rulesRes.json(),
                tokensRes.json(),
                filtersRes.json(),
            ]);
            if (rulesData.success) setRules(rulesData.rules);
            if (tokensData.success) setTokens(tokensData.tokens);
            if (filtersData.success) setAvailableModels(filtersData.models ?? []);

            // Fire-and-forget daily limit enforcement
            fetch("/api/rules/enforce", { method: "POST" }).catch(() => {});
        } catch (error) {
            console.error("Failed to load rules", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        } else if (status === "authenticated") {
            fetchAll();
        }
    }, [status, router, fetchAll]);

    const openModal = () => {
        setModalStep(1);
        setSelectedTokenId("");
        setSelectedType("total_limit");
        setLimitInput("");
        setSelectedModels([]);
        setModalError("");
        setShowModal(true);
    };

    const handleSubmit = async () => {
        if (!selectedTokenId) { setModalError("Select an API key"); return; }
        if (selectedType !== "model_allowlist" && !limitInput) { setModalError("Enter a limit amount"); return; }
        if (selectedType === "model_allowlist" && selectedModels.length === 0) { setModalError("Select at least one model"); return; }

        const token = tokens.find((t) => t.id === selectedTokenId);
        if (!token) return;

        setSubmitting(true);
        setModalError("");
        try {
            const res = await fetch("/api/rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tokenId: selectedTokenId,
                    tokenName: token.name,
                    type: selectedType,
                    limitUSD: selectedType !== "model_allowlist" ? parseFloat(limitInput) : undefined,
                    models: selectedType === "model_allowlist" ? selectedModels : undefined,
                }),
            });
            const data = await res.json();
            if (!data.success) {
                setModalError(data.message || "Failed to create rule");
            } else {
                setShowModal(false);
                fetchAll();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (ruleId: string, tokenName: string) => {
        if (!confirm(`Remove rule for "${tokenName}"? This will restore the key to its previous state.`)) return;
        try {
            const res = await fetch(`/api/rules/${ruleId}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                fetchAll();
            } else {
                alert(data.message || "Failed to remove rule");
            }
        } catch {
            alert("Failed to remove rule");
        }
    };

    const toggleModel = (model: string) => {
        setSelectedModels((prev) =>
            prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]
        );
    };

    const formatUsage = (rule: Rule): string => {
        if (rule.type === "total_limit" && rule.limitUSD != null) {
            return `$${rule.usedUSD.toFixed(2)} of $${rule.limitUSD.toFixed(2)}`;
        }
        if (rule.type === "daily_limit") {
            return `$${rule.usedUSD.toFixed(2)} today`;
        }
        return "—";
    };

    const formatLimit = (rule: Rule): string => {
        if (rule.type === "total_limit" && rule.limitUSD != null) return `$${rule.limitUSD.toFixed(2)} total`;
        if (rule.type === "daily_limit" && rule.limitUSD != null) return `$${rule.limitUSD.toFixed(2)}/day`;
        if (rule.type === "model_allowlist" && rule.models) {
            const list = rule.models.split(",").filter(Boolean);
            return list.length <= 2 ? list.join(", ") : `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
        }
        return "—";
    };

    const isOverLimit = (rule: Rule): boolean => {
        if (rule.type === "daily_limit" && rule.limitUSD != null) return rule.usedUSD >= rule.limitUSD;
        if (rule.type === "total_limit" && rule.remainingUSD != null) return rule.remainingUSD <= 0;
        return false;
    };

    if (status === "loading" || loading) {
        return (
            <DashboardLayout>
                <div className={styles.loading}>Loading rules...</div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div>
                        <h1>Rules &amp; Governance</h1>
                        <p>Control spending limits and model access for your API keys.</p>
                    </div>
                    <button className={styles.addBtn} onClick={openModal}>
                        + Add Rule
                    </button>
                </div>

                <div className={styles.rulesCard}>
                    {rules.length === 0 ? (
                        <div className={styles.empty}>
                            <div className={styles.emptyIcon}>🛡️</div>
                            <p>No rules yet. Add a rule to control spending or restrict model access.</p>
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>API Key</th>
                                    <th>Rule Type</th>
                                    <th>Limit</th>
                                    <th>Usage</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map((rule) => (
                                    <tr key={rule.id}>
                                        <td>
                                            <div className={styles.ruleName}>{rule.tokenName}</div>
                                        </td>
                                        <td>
                                            <span className={styles.typeBadge}>
                                                {RULE_TYPE_LABELS[rule.type as RuleType] ?? rule.type}
                                            </span>
                                        </td>
                                        <td>{formatLimit(rule)}</td>
                                        <td className={isOverLimit(rule) ? styles.overLimit : ""}>{formatUsage(rule)}</td>
                                        <td>
                                            <span className={`${styles.status} ${isOverLimit(rule) ? styles.statusDisabled : styles.statusActive}`}>
                                                {isOverLimit(rule) ? "● Blocked" : "● Active"}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                className={`${styles.actionBtn} ${styles.revokeBtn}`}
                                                title="Remove Rule"
                                                onClick={() => handleDelete(rule.id, rule.tokenName)}
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Create Rule Modal */}
            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Add Rule</h2>
                            <button className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        {/* Step 1: Pick key */}
                        {modalStep === 1 && (
                            <div className={styles.step}>
                                <p className={styles.stepLabel}>Step 1 of 3 — Select API key</p>
                                <select
                                    className={styles.select}
                                    value={selectedTokenId}
                                    onChange={(e) => setSelectedTokenId(Number(e.target.value) || "")}
                                >
                                    <option value="">Choose an API key...</option>
                                    {tokens.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                                <div className={styles.modalFooter}>
                                    <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
                                    <button
                                        className={styles.primaryBtn}
                                        disabled={!selectedTokenId}
                                        onClick={() => setModalStep(2)}
                                    >
                                        Next →
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Pick rule type */}
                        {modalStep === 2 && (
                            <div className={styles.step}>
                                <p className={styles.stepLabel}>Step 2 of 3 — Select rule type</p>
                                <div className={styles.ruleTypeGrid}>
                                    {(["total_limit", "daily_limit", "model_allowlist"] as RuleType[]).map((type) => (
                                        <button
                                            key={type}
                                            className={`${styles.ruleTypeCard} ${selectedType === type ? styles.ruleTypeCardSelected : ""}`}
                                            onClick={() => setSelectedType(type)}
                                        >
                                            <span className={styles.ruleTypeIcon}>
                                                {type === "total_limit" ? "💰" : type === "daily_limit" ? "⏱" : "🤖"}
                                            </span>
                                            <span className={styles.ruleTypeTitle}>{RULE_TYPE_LABELS[type]}</span>
                                            <span className={styles.ruleTypeDesc}>
                                                {type === "total_limit" && "Key stops when budget runs out"}
                                                {type === "daily_limit" && "Resets every midnight UTC"}
                                                {type === "model_allowlist" && "Only listed models allowed"}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                <div className={styles.modalFooter}>
                                    <button className={styles.cancelBtn} onClick={() => setModalStep(1)}>← Back</button>
                                    <button className={styles.primaryBtn} onClick={() => setModalStep(3)}>Next →</button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Configure */}
                        {modalStep === 3 && (
                            <div className={styles.step}>
                                <p className={styles.stepLabel}>Step 3 of 3 — Configure</p>

                                {selectedType === "model_allowlist" ? (
                                    <div>
                                        <p className={styles.fieldLabel}>Allowed models (select all that apply)</p>
                                        {availableModels.length === 0 ? (
                                            <p className={styles.emptyModels}>No models found in your usage history. Make some API calls first.</p>
                                        ) : (
                                            <div className={styles.modelGrid}>
                                                {availableModels.map((model) => (
                                                    <label key={model} className={styles.modelLabel}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedModels.includes(model)}
                                                            onChange={() => toggleModel(model)}
                                                        />
                                                        <span>{model}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div>
                                        <label className={styles.fieldLabel}>
                                            {selectedType === "daily_limit" ? "Daily limit (USD)" : "Total budget (USD)"}
                                        </label>
                                        <div className={styles.dollarInput}>
                                            <span>$</span>
                                            <input
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                placeholder="5.00"
                                                className={styles.numberInput}
                                                value={limitInput}
                                                onChange={(e) => setLimitInput(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}

                                {modalError && <p className={styles.errorMsg}>{modalError}</p>}

                                <div className={styles.modalFooter}>
                                    <button className={styles.cancelBtn} onClick={() => setModalStep(2)}>← Back</button>
                                    <button className={styles.primaryBtn} disabled={submitting} onClick={handleSubmit}>
                                        {submitting ? "Saving..." : "Create Rule"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
