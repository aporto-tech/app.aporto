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
                                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Type</th>
                                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Amount</th>
                                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Model / Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => {
                                        const date = new Date(log.created_at * 1000).toLocaleString();
                                        // log.type mapping (New-API typical enum format: 1=consume, 2=top-up, 3=system admin modify, 4=system consume)
                                        const typeStr = log.type === 1 ? "Consume" 
                                            : log.type === 2 ? "Top-up" 
                                            : log.type === 3 ? "System"
                                            : "Other";
                                            
                                        return (
                                            <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                                <td style={{ padding: "12px 16px", color: "#ccc" }}>{date}</td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <span style={{ 
                                                        background: log.type === 1 ? "rgba(239, 68, 68, 0.1)" : "rgba(0, 220, 130, 0.1)", 
                                                        color: log.type === 1 ? "#ef4444" : "#00dc82",
                                                        padding: "4px 8px", borderRadius: "4px", fontSize: "12px"
                                                    }}>
                                                        {typeStr}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <div style={{ fontWeight: 500, color: log.type === 1 ? "#ef4444" : (log.costUSD > 0 ? "#00dc82" : "#ccc") }}>
                                                        {log.type === 1 && log.costUSD > 0 ? "-" : (log.costUSD > 0 ? "+" : "")}
                                                        ${log.costUSD.toFixed(4)}
                                                    </div>
                                                    {log.prompt_tokens + log.completion_tokens > 0 && (
                                                        <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                                                            {log.prompt_tokens + log.completion_tokens} tkns
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: "12px 16px", color: "#ccc" }}>
                                                    {log.model_name ? (
                                                        <span style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px", fontSize: "12px" }}>
                                                            {log.model_name}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: "13px", color: "#888" }}>{log.content}</span>
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
