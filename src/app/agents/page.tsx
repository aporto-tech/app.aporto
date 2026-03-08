"use client";

import React from "react";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./agents.module.css";

export default function AgentsPage() {
    return (
        <DashboardLayout>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div>
                        <h1>Agents</h1>
                        <p>Monitor and manage your AI agents.</p>
                    </div>
                    <button className={styles.setupBtn}>Set Up Agent</button>
                </div>

                <div className={styles.statsGrid}>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>TOTAL AGENTS</span>
                        <span className={styles.statValue}>0</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>TOTAL SPEND</span>
                        <span className={styles.statValue}>$0.000000</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>AVG AGENT SPEND</span>
                        <span className={styles.statValue}>$0.000000</span>
                    </div>
                </div>

                <div className={styles.toolbar}>
                    <div className={styles.filters}>
                        <select className={styles.filterSelect}>
                            <option>All (0)</option>
                        </select>
                        <div className={styles.filterGroup}>
                            <button className={styles.filterTab}>Active (0)</button>
                            <button className={styles.filterTab}>Paused (0)</button>
                            <button className={styles.filterTab}>At Limit (0)</button>
                        </div>
                    </div>

                    <div className={styles.sortControls}>
                        <span>Sort by:</span>
                        <button className={`${styles.sortBtn} ${styles.active}`}>Spend</button>
                        <button className={styles.sortBtn}>Usage</button>
                        <button className={styles.sortBtn}>Created</button>
                    </div>
                </div>

                <div className={styles.contentArea}>
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>🖥️</div>
                        <h2 className={styles.emptyTitle}>No agents yet</h2>
                        <p className={styles.emptyDesc}>Get started by creating your first AI agent to automate tasks and workflows.</p>
                        <button className={styles.setupBtn}>Create Agent</button>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
