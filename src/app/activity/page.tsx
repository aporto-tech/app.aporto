"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./activity.module.css";
import { useSession } from "next-auth/react";

interface LogItem {
    id: number;
    created_at: number;
    type: number;
    content: string;
    model_name: string;
    token_name: string;
    quota: number;
    costUSD: number;
    prompt_tokens: number;
    completion_tokens: number;
}

export default function ActivityPage() {
    const { status } = useSession();
    
    // Data state
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [totalLogs, setTotalLogs] = useState(0);
    const [loading, setLoading] = useState(true);
    
    // Pagination state
    const [page, setPage] = useState(0);
    const pageSize = 20;

    // Filter options
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [availableTokens, setAvailableTokens] = useState<string[]>([]);

    // Active filters
    const [filterAgent, setFilterAgent] = useState("All Agents");
    const [filterModel, setFilterModel] = useState("All Models");
    const [filterType, setFilterType] = useState("All Types");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const fetchFilters = useCallback(async () => {
        try {
            const res = await fetch("/api/newapi/filters");
            const data = await res.json();
            if (data.success) {
                setAvailableModels(data.models);
                setAvailableTokens(data.tokens);
            }
        } catch (err) {
            console.error("Failed to fetch filters:", err);
        }
    }, []);

    const fetchLogs = useCallback(async () => {
        if (status !== "authenticated") return;
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                size: pageSize.toString(),
            });

            if (filterAgent !== "All Agents") params.append("token_name", filterAgent);
            if (filterModel !== "All Models") params.append("model_name", filterModel);
            if (filterType !== "All Types") params.append("log_type", filterType);
            if (startDate) params.append("start_date", (new Date(startDate).getTime() / 1000).toString());
            if (endDate) {
                // End of day
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                params.append("end_date", (end.getTime() / 1000).toString());
            }

            const res = await fetch(`/api/newapi/logs?${params.toString()}`, { cache: "no-store" });
            const data = await res.json();
            if (data.success && data.logs) {
                setLogs(data.logs);
                setTotalLogs(data.total);
            }
        } catch (err) {
            console.error("Failed to fetch logs:", err);
        } finally {
            setLoading(false);
        }
    }, [status, page, filterAgent, filterModel, filterType, startDate, endDate]);

    useEffect(() => {
        if (status === "authenticated") {
            fetchFilters();
        }
    }, [status, fetchFilters]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const totalPages = Math.ceil(totalLogs / pageSize);

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const renderPagination = useMemo(() => {
        if (totalPages <= 1) return null;

        const pages = [];
        const maxVisiblePages = 5;
        let startPage = Math.max(0, page - 2);
        let endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 1);

        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(0, endPage - maxVisiblePages + 1);
        }

        return (
            <div className={styles.pagination}>
                <button 
                    className={styles.pageButton} 
                    disabled={page === 0}
                    onClick={() => handlePageChange(page - 1)}
                >
                    Prev
                </button>
                
                {startPage > 0 && (
                    <>
                        <button className={styles.pageButton} onClick={() => handlePageChange(0)}>1</button>
                        {startPage > 1 && <span style={{ color: "#475569" }}>...</span>}
                    </>
                )}

                {Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map(p => (
                    <button 
                        key={p} 
                        className={`${styles.pageButton} ${page === p ? styles.pageButtonActive : ""}`}
                        onClick={() => handlePageChange(p)}
                    >
                        {p + 1}
                    </button>
                ))}

                {endPage < totalPages - 1 && (
                    <>
                        {endPage < totalPages - 2 && <span style={{ color: "#475569" }}>...</span>}
                        <button className={styles.pageButton} onClick={() => handlePageChange(totalPages - 1)}>{totalPages}</button>
                    </>
                )}

                <button 
                    className={styles.pageButton} 
                    disabled={page === totalPages - 1}
                    onClick={() => handlePageChange(page + 1)}
                >
                    Next
                </button>
            </div>
        );
    }, [page, totalPages]);

    return (
        <DashboardLayout>
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1>Activity</h1>
                    <p>Monitor AI agent API transactions and spending.</p>
                </div>

                <div className={styles.toolbar}>
                    <div className={styles.filters}>
                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>AGENT (API KEY)</span>
                            <select 
                                className={styles.filterSelect}
                                value={filterAgent}
                                onChange={(e) => { setFilterAgent(e.target.value); setPage(0); }}
                            >
                                <option>All Agents</option>
                                {availableTokens.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>MODEL</span>
                            <select 
                                className={styles.filterSelect}
                                value={filterModel}
                                onChange={(e) => { setFilterModel(e.target.value); setPage(0); }}
                            >
                                <option>All Models</option>
                                {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className={styles.filterGroup} style={{ maxWidth: '150px' }}>
                            <span className={styles.filterLabel}>TYPE</span>
                            <select 
                                className={styles.filterSelect}
                                value={filterType}
                                onChange={(e) => { setFilterType(e.target.value); setPage(0); }}
                            >
                                <option>All Types</option>
                                <option>Consume</option>
                                <option>Error</option>
                                <option>Top-up</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.dateFilters}>
                        <div className={styles.filterGroup} style={{ maxWidth: '180px' }}>
                            <span className={styles.filterLabel}>FROM</span>
                            <div className={styles.dateInputGroup}>
                                <input 
                                    type="date" 
                                    className={styles.dateInput} 
                                    value={startDate}
                                    onChange={(e) => { setStartDate(e.target.value); setPage(0); }}
                                />
                                {startDate && <span style={{ color: '#64748b', cursor: 'pointer' }} onClick={() => {setStartDate(""); setPage(0);}}>✕</span>}
                            </div>
                        </div>
                        <div className={styles.filterGroup} style={{ maxWidth: '180px' }}>
                            <span className={styles.filterLabel}>TO</span>
                            <div className={styles.dateInputGroup}>
                                <input 
                                    type="date" 
                                    className={styles.dateInput} 
                                    value={endDate}
                                    onChange={(e) => { setEndDate(e.target.value); setPage(0); }}
                                />
                                {endDate && <span style={{ color: '#64748b', cursor: 'pointer' }} onClick={() => {setEndDate(""); setPage(0);}}>✕</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.contentArea}>
                    {loading ? (
                        <div style={{ padding: "100px", textAlign: "center", color: "#64748b" }}>
                            <div style={{ marginBottom: "16px", fontSize: "24px", animation: "spin 2s linear infinite" }}>⏳</div>
                            Loading transactions...
                        </div>
                    ) : logs.length === 0 ? (
                        <div className={styles.emptyState}>
                            <h2 className={styles.emptyTitle}>No transactions found</h2>
                            <p className={styles.emptyDesc}>
                                { (filterAgent !== "All Agents" || filterModel !== "All Models" || startDate || endDate) 
                                    ? "Try adjusting your filters to find what you're looking for." 
                                    : "Transactions will appear here once agents make API calls."
                                }
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Agent (API Key)</th>
                                            <th>Type</th>
                                            <th>Amount</th>
                                            <th>Tokens (In / Out)</th>
                                            <th>Model / Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map(log => {
                                            const date = new Date(log.created_at * 1000).toLocaleString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                            });
                                            
                                            const isError = log.type === 2 && log.content !== "";
                                            const isConsume = log.type === 2 && !isError;
                                            
                                            const typeStr = isError ? "Error" : isConsume ? "Consume" : log.type === 1 ? "Top-up" : "Other";
                                            const typeColor = isError ? "#ef4444" : isConsume ? "#00dc82" : (log.type === 1 ? "#3b82f6" : "#94a3b8");
                                            const typeBg = isError ? "rgba(239, 68, 68, 0.1)" : isConsume ? "rgba(0, 220, 130, 0.1)" : (log.type === 1 ? "rgba(59, 130, 246, 0.1)" : "rgba(255, 255, 255, 0.05)");

                                            return (
                                                <tr key={log.id}>
                                                    <td style={{ color: "#94a3b8", whiteSpace: "nowrap", fontSize: "13px" }}>{date}</td>
                                                    <td style={{ fontWeight: 500 }}>
                                                        {log.token_name || <span style={{ color: "#64748b" }}>—</span>}
                                                    </td>
                                                    <td>
                                                        <span style={{ 
                                                            background: typeBg, 
                                                            color: typeColor,
                                                            padding: "4px 8px", borderRadius: "4px", fontSize: "12px",
                                                            fontWeight: 600
                                                        }}>
                                                            {typeStr}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontWeight: 600, color: isError ? "#ef4444" : (log.costUSD > 0 ? typeColor : "#cbd5e1") }}>
                                                            {log.type === 2 && log.costUSD > 0 ? "-" : (log.costUSD > 0 ? "+" : "")}
                                                            ${log.costUSD.toFixed(4)}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: "flex", gap: "12px", fontSize: "12px" }}>
                                                            <span style={{ color: "#3b82f6" }}>
                                                                IN: {log.prompt_tokens.toLocaleString()}
                                                            </span>
                                                            <span style={{ color: "#a855f7" }}>
                                                                OUT: {log.completion_tokens.toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {log.model_name && (
                                                            <span style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px", fontSize: "12px", color: "#e2e8f0" }}>
                                                                {log.model_name}
                                                            </span>
                                                        )}
                                                        {log.content && (
                                                            <div style={{ fontSize: "12px", color: isError ? "#ef4444" : "#64748b", marginTop: log.model_name ? "6px" : "0", maxWidth: "250px", wordBreak: "break-word" }}>
                                                                {log.content}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {renderPagination}
                        </>
                    )}
                </div>
            </div>
            <style jsx>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </DashboardLayout>
    );
}
