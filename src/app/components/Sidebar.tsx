"use client";

import React, { useEffect, useState } from "react";
import styles from "./layout.module.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const ADMIN_EMAILS = new Set(["pevzner@aporto.tech", "it@aporto.tech"]);

const Sidebar = () => {
    const pathname = usePathname();
    const { data: session, status } = useSession();

    const isAdmin = ADMIN_EMAILS.has((session?.user as any)?.email ?? "");

    // ─── Balance state ────────────────────────────────────────────────────────
    const [balance, setBalance] = useState<{ remainingUSD: number; usedUSD: number } | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(true);

    // ─── Fetch balance ────────────────────────────────────────────────────────
    useEffect(() => {
        if (status === "loading") return;
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
    }, [status, session]);

    // ─── Nav items ────────────────────────────────────────────────────────────
    const isPublisherSection = pathname.startsWith("/publisher");

    const userNavItems = [
        { name: "Dashboard", icon: "📊", path: "/dashboard" },
        { name: "Service Hub", icon: "⚡", path: "/services" },
        { name: "Guide", icon: "📖", path: "/guide" },
    ];

    const userManagementItems = [
        { name: "Agents", icon: "🤖", path: "/agents" },
        { name: "Services", icon: "📁", path: "/all-services" },
        { name: "Rules", icon: "🛡️", path: "/rules" },
        { name: "Activity", icon: "📈", path: "/activity" },
    ];

    const publisherNavItems = [
        { name: "Overview", icon: "📊", path: "/publisher" },
        { name: "Skills", icon: "⚡", path: "/publisher/skills" },
        { name: "Earnings", icon: "💰", path: "/publisher/earnings" },
    ];

    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarLogo}>
                <img src="/logo.svg" alt="Aporto Logo" width={32} height={32} />
                <span className={styles.logoText}>aporto</span>
            </div>

            <nav className={styles.sidebarNav}>
                {isPublisherSection ? (
                    <div className={styles.navSection}>
                        {publisherNavItems.map((item) => {
                            const active = item.path === "/publisher"
                                ? pathname === "/publisher"
                                : pathname.startsWith(item.path);
                            return (
                                <Link
                                    key={item.path}
                                    href={item.path}
                                    className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.name}</span>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <>
                        <div className={styles.navSection}>
                            {userNavItems.map((item) => (
                                <Link
                                    key={item.path}
                                    href={item.path}
                                    className={`${styles.navItem} ${pathname === item.path ? styles.navItemActive : ""}`}
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.name}</span>
                                </Link>
                            ))}
                            <Link
                                href="/publisher"
                                className={`${styles.navItem} ${pathname.startsWith("/publisher") ? styles.navItemActive : ""}`}
                            >
                                <span>🏗️</span>
                                <span>Publisher</span>
                            </Link>
                        </div>

                        <div className={styles.navSection}>
                            <h3 className={styles.sectionTitle}>Management</h3>
                            {userManagementItems.map((item) => (
                                <Link
                                    key={item.path}
                                    href={item.path}
                                    className={`${styles.navItem} ${pathname === item.path ? styles.navItemActive : ""}`}
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.name}</span>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </nav>

            <div className={styles.sidebarFooter}>
                {isAdmin && (
                    <Link href="/admin" className={`${styles.navItem} ${pathname.startsWith("/admin") ? styles.navItemActive : ""}`}>
                        <span>🔧</span>
                        <span>Admin</span>
                    </Link>
                )}
                <Link href="/settings" className={styles.navItem}>
                    <span>⚙️</span>
                    <span>Settings</span>
                </Link>
                <div className={styles.balance}>
                    {balanceLoading ? (
                        <span>Balance: <strong>...</strong></span>
                    ) : (
                        <span>Balance: <strong>${balance?.remainingUSD.toFixed(4) ?? "0.0000"}</strong></span>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
