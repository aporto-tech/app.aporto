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

            {/* Support widget — bottom-right corner */}
            <a
                href="mailto:owen.walker@aporto.tech"
                title="Contact Support"
                style={{
                    position: "fixed",
                    bottom: "24px",
                    right: "24px",
                    background: "#00dc82",
                    color: "#000",
                    borderRadius: "50px",
                    padding: "10px 18px",
                    fontSize: "13px",
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 4px 16px rgba(0,220,130,0.3)",
                    zIndex: 999,
                    transition: "background 0.2s, transform 0.2s",
                }}
                onMouseEnter={e => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "#00c071";
                    (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)";
                }}
                onMouseLeave={e => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "#00dc82";
                    (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
                }}
            >
                <span style={{ fontSize: "16px" }}>💬</span>
                Support
            </a>
        </div>
    );
};

export default DashboardLayout;
