"use client";

import React from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import styles from "./layout.module.css";

interface DashboardLayoutProps {
    children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
    return (
        <div className={styles.layout}>
            <Sidebar />
            <main className={styles.mainContent}>
                <Header />
                <div className={styles.contentBody}>{children}</div>
            </main>
        </div>
    );
};

export default DashboardLayout;
