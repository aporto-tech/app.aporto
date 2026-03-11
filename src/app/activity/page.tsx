"use client";

import React, { useEffect, useState } from "react";
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
    // Current date for default display
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const [logs, setLogs] = useState<LogItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (status !== "authenticated") return;
        
        const fetchLogs = async () => {
            try {
                const res = await fetch("/api/newapi/logs?page=0&size=50");
                const data = await res.json();
                if (data.success && data.logs) {
                    setLogs(data.logs);
                }
            } catch (err) {
                console.error("Failed to fetch logs:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, [status]);

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
                            <span className={styles.filterLabel}>AGENT</span>
                            <select className={styles.filterSelect}>
                                <option>All Agents</option>
                            </select>
                        </div>
                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>SERVICE</span>
                            <select className={styles.filterSelect}>
                                <option>All Services</option>
                            </select>
                        </div>
                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>RULE</span>
                            <select className={styles.filterSelect}>
                                <option>All Rules</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.dateFilters}>
                        <div className={styles.dateInputGroup}>
                            <span className={styles.dateIcon}>📅</span>
                            <input type="text" className={styles.dateInput} defaultValue={today} />
                            <span style={{ color: '#64748b', cursor: 'pointer' }}>✕</span>
                        </div>
                        <span className={styles.dateTo}>To</span>
                        <div className={styles.dateInputGroup}>
                            <span className={styles.dateIcon}>📅</span>
                            <input type="text" className={styles.dateInput} placeholder="To Date" />
                        </div>
                    </div>
                </div>

                <div className={styles.contentArea}>
                    {loading ? (
                        <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>Loading logs...</div>
                    ) : logs.length === 0 ? (
                        <div className={styles.emptyState}>
                            <h2 className={styles.emptyTitle}>No transactions found</h2>
                            <p className={styles.emptyDesc}>Transactions will appear here once agents make API calls</p>
                        </div>
                    ) : (
                        <div style={{ width: "100%", overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#888" }}>
                                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Time</th>
                                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>API Key</th>
                                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Type</th>
                                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Amount</th>
                                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Tokens (In / Out)</th>
                                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Model / Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => {
                                        const date = new Date(log.created_at * 1000).toLocaleString();
                                        
                                        // An error in NewAPI is usually a consume (2) with a non-empty error message in 'content'
                                        // Sometimes a completely failed prompt has 0 tokens and 0 quota, but 'content' holds the err.
                                        const isError = log.type === 2 && log.content !== "";
                                        const isConsume = log.type === 2 && !isError;
                                        
                                        const typeStr = isError ? "Error" : isConsume ? "Consume" : log.type === 1 ? "Top-up" : "Other";
                                        const typeColor = isError ? "#ef4444" : isConsume ? "#00dc82" : (log.type === 1 ? "#3b82f6" : "#888");
                                        const typeBg = isError ? "rgba(239, 68, 68, 0.1)" : isConsume ? "rgba(0, 220, 130, 0.1)" : (log.type === 1 ? "rgba(59, 130, 246, 0.1)" : "rgba(255, 255, 255, 0.05)");

                                        return (
                                            <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                                <td style={{ padding: "12px 16px", color: "#ccc", whiteSpace: "nowrap" }}>{date}</td>
                                                <td style={{ padding: "12px 16px", color: "#e2e8f0", fontWeight: 500 }}>
                                                    {log.token_name || <span style={{ color: "#64748b" }}>—</span>}
                                                </td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <span style={{ 
                                                        background: typeBg, 
                                                        color: typeColor,
                                                        padding: "4px 8px", borderRadius: "4px", fontSize: "12px",
                                                        fontWeight: 500
                                                    }}>
                                                        {typeStr}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <div style={{ fontWeight: 500, color: isError ? "#ef4444" : (log.costUSD > 0 ? typeColor : "#ccc") }}>
                                                        {log.type === 2 && log.costUSD > 0 ? "-" : (log.costUSD > 0 ? "+" : "")}
                                                        ${log.costUSD.toFixed(4)}
                                                    </div>
                                                </td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <div style={{ display: "flex", gap: "12px", fontSize: "12px" }}>
                                                        <span style={{ color: "#3b82f6" }} title="Incoming (Prompt) Tokens">
                                                            IN: {log.prompt_tokens}
                                                        </span>
                                                        <span style={{ color: "#a855f7" }} title="Outgoing (Completion) Tokens">
                                                            OUT: {log.completion_tokens}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: "12px 16px", color: "#ccc" }}>
                                                    {log.model_name && (
                                                        <span style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px", fontSize: "12px" }}>
                                                            {log.model_name}
                                                        </span>
                                                    )}
                                                    {log.content && (
                                                        <div style={{ fontSize: "12px", color: isError ? "#ef4444" : "#888", marginTop: log.model_name ? "6px" : "0", maxWidth: "250px", wordBreak: "break-word" }}>
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
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
