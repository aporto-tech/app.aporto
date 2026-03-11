"use client";

import React, { useEffect, useState } from "react";
import styles from "./layout.module.css";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Sidebar = () => {
    const pathname = usePathname();
    const [balance, setBalance] = useState<number | null>(null);

    useEffect(() => {
        const fetchBalance = async () => {
            try {
                const res = await fetch("/api/newapi/balance", { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && typeof data.remainingUSD === "number") {
                        setBalance(data.remainingUSD);
                    }
                }
            } catch {
                // silently fail
            }
        };

        fetchBalance();
        // Refresh every 60 seconds
        const interval = setInterval(fetchBalance, 60_000);
        return () => clearInterval(interval);
    }, []);

    const navItems = [
        { name: "Dashboard", icon: "📊", path: "/dashboard" },
        { name: "Service Hub", icon: "⚡", path: "/services" },
        { name: "Guide", icon: "📖", path: "/guide" },
    ];

    const managementItems = [
        { name: "Agents", icon: "🤖", path: "/agents" },
        { name: "Services", icon: "📁", path: "/all-services" },
        { name: "Rules", icon: "🛡️", path: "/rules", hasAdd: true },
        { name: "Activity", icon: "📈", path: "/activity" },
    ];

    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarLogo}>
                <img src="/logo.svg" alt="Aporto Logo" width={32} height={32} />
                <span className={styles.logoText}>aporto</span>
            </div>

            <nav className={styles.sidebarNav}>
                <div className={styles.navSection}>
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            href={item.path}
                            className={`${styles.navItem} ${pathname === item.path ? styles.navItemActive : ""
                                }`}
                        >
                            <span>{item.icon}</span>
                            <span>{item.name}</span>
                        </Link>
                    ))}
                </div>

                <div className={styles.navSection}>
                    <h3 className={styles.sectionTitle}>Management</h3>
                    {managementItems.map((item) => (
                        <Link
                            key={item.path}
                            href={item.path}
                            className={`${styles.navItem} ${pathname === item.path ? styles.navItemActive : ""
                                }`}
                        >
                            <span>{item.icon}</span>
                            <span>{item.name}</span>
                        </Link>
                    ))}
                </div>
            </nav>

            <div className={styles.sidebarFooter}>
                <Link href="/settings" className={styles.navItem}>
                    <span>⚙️</span>
                    <span>Settings</span>
                </Link>
                <div className={styles.balance}>
                    Balance: <strong>${balance !== null ? balance.toFixed(4) : "0.0000"}</strong>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
