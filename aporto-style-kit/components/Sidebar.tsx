"use client";

import React from "react";
import styles from "./layout.module.css";
// import Link from "next/link"; // Uncomment if using Next.js Link
// import { usePathname } from "next/navigation"; // Uncomment if using Next.js Hooks

const Sidebar = () => {
    // const pathname = usePathname();

    const navItems = [
        { name: "Dashboard", icon: "📊", path: "/dashboard" },
        { name: "Settings", icon: "⚙️", path: "/settings" },
    ];

    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarLogo}>
                <div style={{ width: 32, height: 32, background: "#00dc82", borderRadius: 6 }}></div>
                <span className={styles.logoText}>aporto</span>
            </div>

            <nav className={styles.sidebarNav}>
                <div className={styles.navSection}>
                    {navItems.map((item) => (
                        <a
                            key={item.path}
                            href={item.path}
                            className={styles.navItem}
                        >
                            <span>{item.icon}</span>
                            <span>{item.name}</span>
                        </a>
                    ))}
                </div>
            </nav>

            <div className={styles.sidebarFooter}>
                <div className={styles.balance}>
                    <span>Balance: <strong>$0.00</strong></span>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
