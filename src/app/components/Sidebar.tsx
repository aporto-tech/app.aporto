"use client";

import React, { useState, useEffect } from "react";
import styles from "./layout.module.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const Sidebar = () => {
    const pathname = usePathname();
    const { status } = useSession();

    const [balance, setBalance] = useState<{ remainingUSD: number; usedUSD: number } | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(true);

    useEffect(() => {
        if (status !== "authenticated") return;
        const fetchBalance = async () => {
            setBalanceLoading(true);
            try {
                const res = await fetch("/api/newapi/balance");
                const data = await res.json() as { success: boolean; remainingUSD?: number; usedUSD?: number };
                if (data.success) {
                    setBalance({ remainingUSD: data.remainingUSD ?? 0, usedUSD: data.usedUSD ?? 0 });
                }
            } catch {
                // silently fail
            } finally {
                setBalanceLoading(false);
            }
        };
        fetchBalance();
        const interval = setInterval(fetchBalance, 60_000);
        return () => clearInterval(interval);
    }, [status]);

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
                    Balance: <strong>${balanceLoading || !balance ? "0.00" : balance.remainingUSD.toFixed(2)}</strong>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
