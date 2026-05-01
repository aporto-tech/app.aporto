"use client";

import React, { useEffect, useState } from "react";
import styles from "./layout.module.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const ADMIN_EMAILS = new Set(["pevzner@aporto.tech", "it@aporto.tech"]);

type SidebarContext = "user" | "publisher";
type PublisherStatus = "loading" | "none" | "pending" | "approved" | "suspended";

const Sidebar = () => {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, status } = useSession();

    const isAdmin = ADMIN_EMAILS.has((session?.user as any)?.email ?? "");

    // ─── Balance state ────────────────────────────────────────────────────────
    const [balance, setBalance] = useState<{ remainingUSD: number; usedUSD: number } | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(true);

    // ─── Publisher state ──────────────────────────────────────────────────────
    const [publisherStatus, setPublisherStatus] = useState<PublisherStatus>("loading");
    const [publisherEarnings, setPublisherEarnings] = useState(0);

    // ─── Context switcher ─────────────────────────────────────────────────────
    const [sidebarCtx, setSidebarCtx] = useState<SidebarContext>(() => {
        if (typeof window === "undefined") return "user";
        if (pathname.startsWith("/publisher")) return "publisher";
        try {
            const stored = localStorage.getItem("aporto_sidebar_context");
            if (stored === "publisher" || stored === "user") return stored as SidebarContext;
        } catch {}
        return "user";
    });

    // Sync context when user navigates directly to /publisher/* routes
    useEffect(() => {
        if (pathname.startsWith("/publisher")) {
            setSidebarCtx("publisher");
        }
    }, [pathname]);

    // Persist context choice
    useEffect(() => {
        try {
            localStorage.setItem("aporto_sidebar_context", sidebarCtx);
        } catch {}
    }, [sidebarCtx]);

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

    // ─── Fetch publisher status (session auth, not publisher API key) ─────────
    useEffect(() => {
        if (status === "loading" || !session) return;
        const fetchPublisherStatus = async () => {
            try {
                const res = await fetch("/api/publisher/status");
                if (!res.ok) { setPublisherStatus("none"); return; }
                const data = await res.json() as { status: string; totalUnpaidUSD: number };
                const ps = data.status as PublisherStatus;
                setPublisherStatus(ps);
                setPublisherEarnings(data.totalUnpaidUSD);
                // Force-switch suspended users out of publisher context
                if (ps === "suspended") {
                    setSidebarCtx("user");
                    if (pathname.startsWith("/publisher")) router.push("/dashboard");
                }
            } catch {
                setPublisherStatus("none");
            }
        };
        fetchPublisherStatus();
    }, [status, session]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleContextSwitch = (ctx: SidebarContext) => {
        setSidebarCtx(ctx);
        if (ctx === "publisher" && !pathname.startsWith("/publisher")) {
            router.push("/publisher");
        }
        if (ctx === "user" && pathname.startsWith("/publisher")) {
            router.push("/dashboard");
        }
    };

    // ─── Nav items ────────────────────────────────────────────────────────────
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

    // Overview → Skills → Earnings (API Keys removed from main nav — programmatic access only)
    const publisherNavItems = publisherStatus === "pending"
        ? [{ name: "Overview", icon: "📊", path: "/publisher" }]
        : [
            { name: "Overview", icon: "📊", path: "/publisher" },
            { name: "Skills", icon: "⚡", path: "/publisher/skills" },
            { name: "Earnings", icon: "💰", path: "/publisher/earnings" },
        ];

    // Context switcher visible only for publishers (pending or approved)
    const showSwitcher = publisherStatus === "approved" || publisherStatus === "pending";

    // ─── Publisher badge ──────────────────────────────────────────────────────
    const PublisherBadge = () => {
        if (publisherStatus === "loading") {
            return <span className={styles.publisherBadgeLoading}>···</span>;
        }
        if (publisherStatus === "approved" && publisherEarnings > 0) {
            return <span className={styles.publisherBadgeApproved}>${publisherEarnings.toFixed(2)}</span>;
        }
        if (publisherStatus === "approved") {
            return <span className={styles.publisherBadgeApproved}>✓</span>;
        }
        if (publisherStatus === "pending") {
            return <span className={styles.publisherBadgePending}>pending</span>;
        }
        if (publisherStatus === "suspended") {
            return <span className={styles.publisherBadgeSuspended}>suspended</span>;
        }
        return <span className={styles.publisherBadgeApply}>→ Apply</span>;
    };

    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarLogo}>
                <img src="/logo.svg" alt="Aporto Logo" width={32} height={32} />
                <span className={styles.logoText}>aporto</span>
            </div>

            {/* Context switcher — only for approved/pending publishers */}
            {showSwitcher && (
                <div className={styles.contextSwitcher}>
                    <button
                        className={`${styles.switcherTab} ${sidebarCtx === "user" ? styles.switcherTabActive : ""}`}
                        onClick={() => handleContextSwitch("user")}
                    >
                        User
                    </button>
                    <button
                        className={`${styles.switcherTab} ${sidebarCtx === "publisher" ? styles.switcherTabActive : ""}`}
                        onClick={() => handleContextSwitch("publisher")}
                    >
                        Publisher
                    </button>
                </div>
            )}

            <nav className={styles.sidebarNav}>
                {sidebarCtx === "user" ? (
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
                            {/* Publisher entry point — shown when no switcher (none/loading/suspended) */}
                            {!showSwitcher && (
                                <Link
                                    href="/publisher"
                                    className={`${styles.navItem} ${pathname.startsWith("/publisher") ? styles.navItemActive : ""}`}
                                >
                                    <span>🏗️</span>
                                    <span className={styles.navItemWithBadge}>
                                        Publisher
                                        <PublisherBadge />
                                    </span>
                                </Link>
                            )}
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
                ) : (
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
                        <div style={{ borderTop: "1px solid #222", margin: "12px 4px 8px" }} />
                        <button
                            className={styles.navItem}
                            onClick={() => handleContextSwitch("user")}
                            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "#555" }}
                        >
                            <span style={{ fontSize: 12 }}>←</span>
                            <span>User Dashboard</span>
                        </button>
                    </div>
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
                {sidebarCtx === "publisher" ? (
                    <div className={styles.balance}>
                        <span>Unpaid: <strong style={{ color: "#10b981" }}>${publisherEarnings.toFixed(2)}</strong></span>
                    </div>
                ) : (
                    <div className={styles.balance}>
                        {balanceLoading ? (
                            <span>Balance: <strong>...</strong></span>
                        ) : (
                            <span>Balance: <strong>${balance?.remainingUSD.toFixed(4) ?? "0.0000"}</strong></span>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
