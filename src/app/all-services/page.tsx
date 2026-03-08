"use client";

import React from "react";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./all-services.module.css";

export default function AllServicesPage() {
    return (
        <DashboardLayout>
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1>Services</h1>
                    <p>Monitor service and vendor usage across your agents.</p>
                </div>

                <div className={styles.statsGrid}>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>SERVICES TRACKED</span>
                        <span className={styles.statValue}>0</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>AVG SPEND</span>
                        <span className={styles.statValue}>$0.000000</span>
                        <span className={styles.statSubtext}>per transaction</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>TOP SERVICES</span>
                        {/* Area for top services, empty for now */}
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
                        <div className={styles.emptyIcon}>📁</div>
                        <h2 className={styles.emptyTitle}>No services yet</h2>
                        <p className={styles.emptyDesc}>Services will appear automatically when agents make API calls to external providers.</p>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
