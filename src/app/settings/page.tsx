"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./settings.module.css";
import dashboardStyles from "../dashboard.module.css";

interface ApiToken {
    id: number;
    name: string;
    key: string;
    status: number;
    created_time: number;
    remain_quota: number;
    unlimited_quota: boolean;
}

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"api-keys" | "billing">("api-keys");

    const [tokens, setTokens] = useState<ApiToken[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingToken, setEditingToken] = useState<ApiToken | null>(null);
    const [editQuota, setEditQuota] = useState("");
    const [isUnlimited, setIsUnlimited] = useState(false);

    // Create Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKeyName, setNewKeyName] = useState("My API Key");
    const [isCreatingKey, setIsCreatingKey] = useState(false);
    const [generatedKey, setGeneratedKey] = useState("");
    const [showKeyCreatedModal, setShowKeyCreatedModal] = useState(false);

    const fetchTokens = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/newapi/keys");
            const data = await res.json();
            if (data.success) {
                setTokens(data.tokens);
            }
        } catch (error) {
            console.error("Failed to fetch tokens", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        } else if (status === "authenticated" && activeTab === "api-keys") {
            fetchTokens();
        }
    }, [status, router, fetchTokens, activeTab]);

    const handleRevoke = async (tokenId: number) => {
        if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) return;

        try {
            const res = await fetch("/api/newapi/keys", {
                method: "DELETE",
                body: JSON.stringify({ tokenId }),
            });
            const data = await res.json();
            if (data.success) {
                setTokens(tokens.filter(t => t.id !== tokenId));
            }
        } catch (error) {
            alert("Failed to revoke key");
        }
    };

    const handleCreateKey = async () => {
        setIsCreatingKey(true);
        try {
            const res = await fetch("/api/newapi/create-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newKeyName.trim(), description: "" }),
            });
            const data = await res.json();
            if (data.success && data.key) {
                setGeneratedKey(data.key);
                setShowCreateModal(false);
                setShowKeyCreatedModal(true);
                fetchTokens();
            }
        } catch (err) {
            alert("Error creating key");
        } finally {
            setIsCreatingKey(false);
        }
    };

    if (status === "loading") {
        return (
            <DashboardLayout>
                <div style={{ padding: "24px", color: "#888" }}>Loading settings...</div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1>Settings</h1>
                    <p>Manage your account, API keys, and billing.</p>
                </div>

                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === "api-keys" ? styles.active : ""}`}
                        onClick={() => setActiveTab("api-keys")}
                    >
                        API Keys
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === "billing" ? styles.active : ""}`}
                        onClick={() => setActiveTab("billing")}
                    >
                        Billing
                    </button>
                </div>

                {activeTab === "api-keys" && (
                    <div className={styles.keysCard}>
                        <div className={styles.cardHeader}>
                            <h2>API Keys</h2>
                            <p>Manage your API keys for programmatic access to your agents and services</p>
                        </div>

                        <div className={styles.toolbar}>
                            <input type="text" placeholder="Search API keys..." className={styles.searchBox} />
                            <div className={styles.toolbarRight}>
                                <span className={styles.keyCount}>{tokens.length} of {tokens.length} keys</span>
                                <button className={styles.createBtn} onClick={() => setShowCreateModal(true)}>+ Create Key</button>
                            </div>
                        </div>

                        {loading ? (
                            <div className={styles.empty}>Loading keys...</div>
                        ) : tokens.length === 0 ? (
                            <div className={styles.empty}>
                                <div className={styles.emptyIcon}>🔑</div>
                                <p>No API keys found. Create one to get started.</p>
                            </div>
                        ) : (
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Description</th>
                                        <th>Key Prefix</th>
                                        <th>Last Used</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tokens.map((token) => (
                                        <tr key={token.id}>
                                            <td className={styles.keyName}>🗝️ {token.name}</td>
                                            <td style={{ color: "#64748b" }}>—</td>
                                            <td><span className={styles.keyString}>sk_live_{token.key?.substring(0, 10)}***</span></td>
                                            <td style={{ color: "#64748b" }}>Never</td>
                                            <td>{new Date(token.created_time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                                            <td className={styles.actions}>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.revokeBtn}`}
                                                    onClick={() => handleRevoke(token.id)}
                                                >
                                                    ⊗ Revoke
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === "billing" && (
                    <div className={styles.billingCard}>
                        <div className={styles.cardHeader}>
                            <h2>Payment Methods</h2>
                            <p>Manage your payment methods for billing and subscriptions</p>
                        </div>
                        <div className={styles.billingEmpty}>
                            <div className={styles.cardIcon}>💳</div>
                            <h3 className={styles.billingTitle}>No payment method</h3>
                            <p className={styles.billingDesc}>Add a payment method to enable automatic billing</p>
                            <button className={styles.createBtn}>+ Add Payment Method</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className={dashboardStyles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setShowCreateModal(false)}>
                    <div className={dashboardStyles.modalContent}>
                        <div className={dashboardStyles.modalHeader}>
                            <div className={dashboardStyles.modalTitle}>
                                <div style={{ fontSize: 24 }}>🔑</div>
                                <div>
                                    <h2>Create New API Key</h2>
                                    <p className={dashboardStyles.modalSubtitle}>Identify this key with a name.</p>
                                </div>
                            </div>
                            <button className={dashboardStyles.closeButton} onClick={() => setShowCreateModal(false)}>✕</button>
                        </div>
                        <div className={dashboardStyles.modalBody}>
                            <div className={dashboardStyles.formGroup}>
                                <label>Key Name *</label>
                                <input
                                    className={dashboardStyles.formInput}
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className={dashboardStyles.modalFooter}>
                            <button className={dashboardStyles.cancelButton} onClick={() => setShowCreateModal(false)}>Cancel</button>
                            <button className={dashboardStyles.createButton} onClick={handleCreateKey} disabled={isCreatingKey}>
                                {isCreatingKey ? "Creating..." : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Key Created Modal */}
            {showKeyCreatedModal && (
                <div className={dashboardStyles.modalOverlay} onClick={() => setShowKeyCreatedModal(false)}>
                    <div className={dashboardStyles.modalContent}>
                        <div className={dashboardStyles.modalHeader}>
                            <h2>Key Created</h2>
                        </div>
                        <div className={dashboardStyles.modalBody}>
                            <p>Copy your key now. You won&apos;t see it again.</p>
                            <div className={dashboardStyles.keyDisplayBox}>
                                <div className={dashboardStyles.keyValue}>{generatedKey}</div>
                            </div>
                        </div>
                        <div className={dashboardStyles.modalFooter}>
                            <button className={dashboardStyles.createButton} onClick={() => setShowKeyCreatedModal(false)}>Done</button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
