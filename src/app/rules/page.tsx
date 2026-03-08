"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./rules.module.css";
import Link from "next/link";

interface ApiToken {
    id: number;
    name: string;
    key: string;
    status: number;
    created_time: number;
    remain_quota: number;
    unlimited_quota: boolean;
}

export default function RulesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [rules, setRules] = useState<ApiToken[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/newapi/keys", { cache: "no-store" });
            const data = await res.json();
            if (data.success && data.tokens) {
                // A rule exists if the API key is not unlimited or has a remaining quota set
                const activeRules = data.tokens.filter((t: ApiToken) => t.remain_quota > 0 || !t.unlimited_quota);
                setRules(activeRules);
            }
        } catch (error) {
            console.error("Failed to fetch rules", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        } else if (status === "authenticated") {
            fetchRules();
        }
    }, [status, router, fetchRules]);

    const handleRemoveRule = async (token: ApiToken) => {
        if (!confirm(`Are you sure you want to remove the limit from ${token.name}? It will become unlimited.`)) return;

        try {
            // Removing the rule means setting the token back to unlimited
            const res = await fetch("/api/newapi/keys", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tokenId: token.id,
                    name: token.name,
                    remain_quota: 0,
                    unlimited_quota: true
                }),
            });
            const data = await res.json();
            if (data.success) {
                fetchRules(); // Refresh list to remove it from active rules
            } else {
                alert(data.message || "Failed to remove the rule");
            }
        } catch (error) {
            alert("Failed to remove rule");
        }
    };

    if (status === "loading" || loading) {
        return (
            <DashboardLayout>
                <div className={styles.loading}>Loading active rules...</div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1>Rules & Governance</h1>
                    <Link href="/dashboard" style={{ textDecoration: "none" }}>
                        <button className={styles.actionBtn} style={{ background: "#00dc82", color: "#000", padding: "10px 20px", borderRadius: "8px", fontWeight: 600, fontSize: "14px", border: "none" }}>
                            + Add New Rule
                        </button>
                    </Link>
                </div>

                <div className={styles.rulesCard}>
                    {rules.length === 0 ? (
                        <div className={styles.empty}>
                            <div className={styles.emptyIcon}>🛡️</div>
                            <p>No active rules found. Go to the Dashboard to create a spending limit.</p>
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Target API Key</th>
                                    <th>Limit Type</th>
                                    <th>Max Amount</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map((rule) => (
                                    <tr key={rule.id}>
                                        <td>
                                            <div className={styles.ruleName}>{rule.name}</div>
                                            <div className={styles.targetKey}>{rule.key?.substring(0, 8)}...</div>
                                        </td>
                                        <td>Spending</td>
                                        <td>${(rule.remain_quota * 0.002).toFixed(2)}</td>
                                        <td>
                                            <div className={`${styles.status} ${rule.status === 1 ? styles.statusActive : ""}`}>
                                                {rule.status === 1 ? "● Active" : "● Disabled"}
                                            </div>
                                        </td>
                                        <td className={styles.actions}>
                                            <Link href="/api-keys" style={{ textDecoration: "none" }}>
                                                <button className={styles.actionBtn} title="Edit API Key">⚙️</button>
                                            </Link>
                                            <button
                                                className={`${styles.actionBtn} ${styles.revokeBtn}`}
                                                title="Remove Rule (Set to Unlimited)"
                                                onClick={() => handleRemoveRule(rule)}
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
        </DashboardLayout>
    );
}
