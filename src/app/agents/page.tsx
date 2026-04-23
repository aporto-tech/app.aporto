"use client";

import React, { useEffect, useState, useMemo } from "react";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./agents.module.css";

const QUOTA_PER_DOLLAR = 500_000;

interface Agent {
    id: number;
    name: string;
    key: string;
    status: number;       // 1=active, 0=paused
    usedUSD: number;
    remain_quota: number;
    unlimited_quota: boolean;
    created_time: number; // unix seconds
}

type FilterTab = "all" | "active" | "paused" | "limit";
type SortKey = "spend" | "created";

function maskKey(key: string): string {
    if (!key || key.length < 10) return key;
    return key.slice(0, 10) + "..." + key.slice(-4);
}

function agentStatus(a: Agent): FilterTab {
    if (a.status === 0) return "paused";
    if (!a.unlimited_quota && a.remain_quota <= 0) return "limit";
    return "active";
}

export default function AgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterTab>("all");
    const [sort, setSort] = useState<SortKey>("created");

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState("");
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Delete confirm
    const [deleteId, setDeleteId] = useState<number | null>(null);

    async function loadAgents() {
        const res = await fetch("/api/newapi/keys");
        const data = await res.json() as { success: boolean; tokens?: any[] };
        if (data.success && data.tokens) {
            setAgents(data.tokens.map((t: any) => ({
                id: t.id,
                name: t.name,
                key: t.key,
                status: t.status,
                usedUSD: (t.used_quota ?? 0) / QUOTA_PER_DOLLAR,
                remain_quota: t.remain_quota,
                unlimited_quota: t.unlimited_quota,
                created_time: t.created_time,
            })));
        }
        setLoading(false);
    }

    useEffect(() => { loadAgents(); }, []);

    const filtered = useMemo(() => {
        let list = agents;
        if (filter !== "all") list = list.filter(a => agentStatus(a) === filter);
        if (sort === "spend") list = [...list].sort((a, b) => b.usedUSD - a.usedUSD);
        else list = [...list].sort((a, b) => b.created_time - a.created_time);
        return list;
    }, [agents, filter, sort]);

    const counts = useMemo(() => ({
        all: agents.length,
        active: agents.filter(a => agentStatus(a) === "active").length,
        paused: agents.filter(a => agentStatus(a) === "paused").length,
        limit: agents.filter(a => agentStatus(a) === "limit").length,
    }), [agents]);

    const totalSpend = agents.reduce((s, a) => s + a.usedUSD, 0);
    const avgSpend = agents.length > 0 ? totalSpend / agents.length : 0;

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!createName.trim()) return;
        setCreateLoading(true);
        setCreateError("");
        const res = await fetch("/api/newapi/create-key", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: createName.trim() }),
        });
        const data = await res.json() as { success: boolean; key?: string; message?: string };
        setCreateLoading(false);
        if (data.success && data.key) {
            setNewKey(data.key);
            setCreateName("");
            await loadAgents();
        } else {
            setCreateError(data.message ?? "Failed to create agent.");
        }
    }

    function closeCreateModal() {
        setShowCreate(false);
        setCreateName("");
        setCreateError("");
        setNewKey(null);
        setCopied(false);
    }

    async function copyKey() {
        if (!newKey) return;
        await navigator.clipboard.writeText(newKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    async function handleDelete(id: number) {
        await fetch("/api/newapi/keys", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenId: id }),
        });
        setDeleteId(null);
        setAgents(prev => prev.filter(a => a.id !== id));
    }

    async function toggleStatus(agent: Agent) {
        const newStatus: 0 | 1 = agent.status === 1 ? 0 : 1;
        await fetch("/api/newapi/keys", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenId: agent.id, status: newStatus }),
        });
        setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: newStatus } : a));
    }

    if (loading) return (
        <DashboardLayout>
            <div className={styles.container}>
                <div style={{ color: "#64748b", padding: 24 }}>Loading...</div>
            </div>
        </DashboardLayout>
    );

    return (
        <DashboardLayout>
            <div className={styles.container}>
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h1>Agents</h1>
                        <p>API keys that power your AI agents.</p>
                    </div>
                    <button className={styles.setupBtn} onClick={() => setShowCreate(true)}>
                        + Create Agent
                    </button>
                </div>

                {/* Stats */}
                <div className={styles.statsGrid}>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>TOTAL AGENTS</span>
                        <span className={styles.statValue}>{agents.length}</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>TOTAL SPEND</span>
                        <span className={styles.statValue}>${totalSpend.toFixed(4)}</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>AVG AGENT SPEND</span>
                        <span className={styles.statValue}>${avgSpend.toFixed(4)}</span>
                    </div>
                </div>

                {/* Toolbar */}
                <div className={styles.toolbar}>
                    <div className={styles.filters}>
                        <div className={styles.filterGroup}>
                            {(["all", "active", "paused", "limit"] as FilterTab[]).map(f => (
                                <button
                                    key={f}
                                    className={`${styles.filterTab} ${filter === f ? styles.filterTabActive : ""}`}
                                    onClick={() => setFilter(f)}
                                >
                                    {f === "all" ? `All (${counts.all})`
                                        : f === "active" ? `Active (${counts.active})`
                                        : f === "paused" ? `Paused (${counts.paused})`
                                        : `At Limit (${counts.limit})`}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className={styles.sortControls}>
                        <span>Sort by:</span>
                        {(["spend", "created"] as SortKey[]).map(s => (
                            <button
                                key={s}
                                className={`${styles.sortBtn} ${sort === s ? styles.sortBtnActive : ""}`}
                                onClick={() => setSort(s)}
                            >
                                {s === "spend" ? "Spend" : "Created"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Agent list */}
                <div className={styles.contentArea}>
                    {filtered.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>🖥️</div>
                            <h2 className={styles.emptyTitle}>
                                {agents.length === 0 ? "No agents yet" : "No agents match this filter"}
                            </h2>
                            <p className={styles.emptyDesc}>
                                {agents.length === 0
                                    ? "Create your first agent to start making API calls."
                                    : "Try switching to a different filter tab."}
                            </p>
                            {agents.length === 0 && (
                                <button className={styles.setupBtn} onClick={() => setShowCreate(true)}>
                                    Create Agent
                                </button>
                            )}
                        </div>
                    ) : (
                        <table className={styles.agentTable}>
                            <thead>
                                <tr>
                                    {["Name", "Key", "Status", "Spend", "Created", ""].map(h => (
                                        <th key={h} className={styles.th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(a => {
                                    const st = agentStatus(a);
                                    return (
                                        <tr key={a.id} className={styles.agentRow}>
                                            <td className={styles.nameCell}>{a.name}</td>
                                            <td>
                                                <span className={styles.keyText}>{maskKey(a.key)}</span>
                                            </td>
                                            <td>
                                                <span className={`${styles.badge} ${
                                                    st === "active" ? styles.badgeActive
                                                    : st === "paused" ? styles.badgePaused
                                                    : styles.badgeLimit
                                                }`}>
                                                    {st === "active" ? "Active"
                                                        : st === "paused" ? "Paused"
                                                        : "At Limit"}
                                                </span>
                                            </td>
                                            <td className={styles.spendCell}>
                                                ${a.usedUSD.toFixed(4)}
                                            </td>
                                            <td className={styles.dateCell}>
                                                {new Date(a.created_time * 1000).toLocaleDateString()}
                                            </td>
                                            <td className={styles.actionsCell}>
                                                <button
                                                    className={styles.actionBtn}
                                                    onClick={() => toggleStatus(a)}
                                                    title={a.status === 1 ? "Pause" : "Activate"}
                                                >
                                                    {a.status === 1 ? "Pause" : "Activate"}
                                                </button>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                                    onClick={() => setDeleteId(a.id)}
                                                    title="Delete"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Create Agent Modal */}
            {showCreate && (
                <div className={styles.overlay} onClick={closeCreateModal}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        {newKey ? (
                            <>
                                <h2 className={styles.modalTitle}>Agent created</h2>
                                <p className={styles.modalDesc}>
                                    Copy your API key now. It won&apos;t be shown again.
                                </p>
                                <div className={styles.keyReveal}>
                                    <span className={styles.keyRevealText}>{newKey}</span>
                                    <button className={styles.copyBtn} onClick={copyKey}>
                                        {copied ? "Copied!" : "Copy"}
                                    </button>
                                </div>
                                <button className={styles.setupBtn} onClick={closeCreateModal} style={{ marginTop: 16, width: "100%" }}>
                                    Done
                                </button>
                            </>
                        ) : (
                            <form onSubmit={handleCreate}>
                                <h2 className={styles.modalTitle}>Create Agent</h2>
                                <p className={styles.modalDesc}>Give your agent a name to identify it in logs and usage reports.</p>
                                <input
                                    className={styles.modalInput}
                                    placeholder="e.g. My Research Bot"
                                    value={createName}
                                    onChange={e => setCreateName(e.target.value)}
                                    autoFocus
                                    maxLength={64}
                                />
                                {createError && (
                                    <p className={styles.modalError}>{createError}</p>
                                )}
                                <div className={styles.modalActions}>
                                    <button type="button" className={styles.cancelBtn} onClick={closeCreateModal}>
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className={styles.setupBtn}
                                        disabled={createLoading || !createName.trim()}
                                    >
                                        {createLoading ? "Creating..." : "Create"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteId !== null && (
                <div className={styles.overlay} onClick={() => setDeleteId(null)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>Delete agent?</h2>
                        <p className={styles.modalDesc}>
                            This will permanently revoke the API key. Any integrations using it will stop working immediately.
                        </p>
                        <div className={styles.modalActions}>
                            <button className={styles.cancelBtn} onClick={() => setDeleteId(null)}>
                                Cancel
                            </button>
                            <button
                                className={`${styles.setupBtn} ${styles.setupBtnDanger}`}
                                onClick={() => handleDelete(deleteId)}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
