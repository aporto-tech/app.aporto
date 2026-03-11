"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./activity.module.css";

interface LogEntry {
    id: number;
    created_at: number;
    type: number;
    content: string;
    token_name: string;
    model_name: string;
    quota: number;
    prompt_tokens: number;
    completion_tokens: number;
    use_time: number;
}

const LOG_TYPE_LABEL: Record<number, { label: string; color: string }> = {
    1: { label: "Recharge", color: "#3b82f6" },
    2: { label: "Consumption", color: "#f59e0b" },
    3: { label: "Management", color: "#8b5cf6" },
    4: { label: "System", color: "#6b7280" },
};

const QUOTA_PER_DOLLAR = 500_000;

function quotaToUSD(quota: number): string {
    return "$" + (quota / QUOTA_PER_DOLLAR).toFixed(6);
}

function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
}

const PAGE_SIZE = 20;

export default function ActivityPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modelFilter, setModelFilter] = useState("");
    const [tokenFilter, setTokenFilter] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [trigger, setTrigger] = useState(0); // increment to re-fetch

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
            p: String(page),
            size: String(PAGE_SIZE),
            type: "0",
        });
        if (modelFilter) params.set("model_name", modelFilter);
        if (tokenFilter) params.set("token_name", tokenFilter);
        if (startDate) params.set("start_timestamp", String(Math.floor(new Date(startDate).getTime() / 1000)));
        if (endDate) params.set("end_timestamp", String(Math.floor(new Date(endDate).getTime() / 1000)));

        fetch(`/api/newapi/logs?${params.toString()}`)
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                if (data.success) {
                    setLogs(data.data?.items ?? []);
                    setTotal(data.data?.total ?? 0);
                } else {
                    setError(data.message ?? "Failed to fetch logs");
                }
            })
            .catch(e => {
                if (!cancelled) setError(String(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, trigger]);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    function applyFilters() {
        setPage(0);
        setTrigger(t => t + 1);
    }

    return (
        <DashboardLayout>
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1>Activity</h1>
                    <p>Monitor AI API request logs and spending.</p>
                </div>

                {/* Filters */}
                <div className={styles.toolbar}>
                    <div className={styles.filters}>
                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>Model</span>
                            <input
                                className={styles.filterSelect}
                                placeholder="e.g. gpt-4o"
                                value={modelFilter}
                                onChange={e => setModelFilter(e.target.value)}
                                style={{ appearance: "none", backgroundImage: "none" }}
                                onKeyDown={e => { if (e.key === "Enter") applyFilters(); }}
                            />
                        </div>
                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>API Key</span>
                            <input
                                className={styles.filterSelect}
                                placeholder="Key name"
                                value={tokenFilter}
                                onChange={e => setTokenFilter(e.target.value)}
                                style={{ appearance: "none", backgroundImage: "none" }}
                                onKeyDown={e => { if (e.key === "Enter") applyFilters(); }}
                            />
                        </div>
                        <div className={styles.filterGroup} style={{ justifyContent: "flex-end" }}>
                            <span className={styles.filterLabel}>&nbsp;</span>
                            <button className={styles.applyBtn} onClick={applyFilters}>Search</button>
                        </div>
                    </div>
                    <div className={styles.dateFilters}>
                        <div className={styles.dateInputGroup}>
                            <span className={styles.dateIcon}>📅</span>
                            <input
                                type="date"
                                className={styles.dateInput}
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                style={{ width: 150 }}
                            />
                        </div>
                        <span className={styles.dateTo}>→</span>
                        <div className={styles.dateInputGroup}>
                            <span className={styles.dateIcon}>📅</span>
                            <input
                                type="date"
                                className={styles.dateInput}
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                style={{ width: 150 }}
                            />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className={styles.contentArea}>
                    {loading ? (
                        <div className={styles.loadingState}>
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className={styles.skeletonRow} />
                            ))}
                        </div>
                    ) : error ? (
                        <div className={styles.emptyState}>
                            <p className={styles.errorText}>⚠️ {error}</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className={styles.emptyState}>
                            <h2 className={styles.emptyTitle}>No logs found</h2>
                            <p className={styles.emptyDesc}>Logs will appear here once API calls are made</p>
                        </div>
                    ) : (
                        <>
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Type</th>
                                            <th>Model</th>
                                            <th>Key</th>
                                            <th>Prompt</th>
                                            <th>Completion</th>
                                            <th>Cost</th>
                                            <th>Latency</th>
                                            <th>Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => {
                                            const t = LOG_TYPE_LABEL[log.type];
                                            return (
                                                <tr key={log.id}>
                                                    <td className={styles.cellMono}>{formatDate(log.created_at)}</td>
                                                    <td>
                                                        {t ? (
                                                            <span className={styles.typeBadge} style={{ background: t.color + "22", color: t.color }}>
                                                                {t.label}
                                                            </span>
                                                        ) : "—"}
                                                    </td>
                                                    <td><span className={styles.modelTag}>{log.model_name || "—"}</span></td>
                                                    <td className={styles.cellMuted}>{log.token_name || "—"}</td>
                                                    <td className={styles.cellNum}>{log.prompt_tokens.toLocaleString()}</td>
                                                    <td className={styles.cellNum}>{log.completion_tokens.toLocaleString()}</td>
                                                    <td className={styles.cellCost}>{quotaToUSD(log.quota)}</td>
                                                    <td className={styles.cellMuted}>{log.use_time ? `${log.use_time}s` : "—"}</td>
                                                    <td className={styles.cellContent} title={log.content}>{log.content ? log.content.slice(0, 60) + (log.content.length > 60 ? "…" : "") : "—"}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div className={styles.pagination}>
                                    <button
                                        className={styles.pageBtn}
                                        disabled={page === 0}
                                        onClick={() => setPage(p => p - 1)}
                                    >
                                        ← Prev
                                    </button>
                                    <span className={styles.pageInfo}>
                                        Page {page + 1} of {totalPages} · {total} total
                                    </span>
                                    <button
                                        className={styles.pageBtn}
                                        disabled={page >= totalPages - 1}
                                        onClick={() => setPage(p => p + 1)}
                                    >
                                        Next →
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
