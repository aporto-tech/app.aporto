"use client";

import React from "react";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./activity.module.css";

export default function ActivityPage() {
    // Current date for default display
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
                    <div className={styles.emptyState}>
                        <h2 className={styles.emptyTitle}>No transactions found</h2>
                        <p className={styles.emptyDesc}>Transactions will appear here once agents make API calls</p>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
