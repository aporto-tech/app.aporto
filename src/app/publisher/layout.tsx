"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

interface Props { children: ReactNode }

export default function PublisherLayout({ children }: Props) {
    const pathname = usePathname();
    const navLinks = [
        { href: "/publisher", label: "Overview" },
        { href: "/publisher/skills", label: "Skills" },
        { href: "/publisher/keys", label: "API Keys" },
        { href: "/publisher/earnings", label: "Earnings" },
    ];

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: "#0a0f1e", color: "#e2e8f0", fontFamily: "Inter, system-ui, sans-serif" }}>
            {/* Sidebar */}
            <nav style={{ width: 220, borderRight: "1px solid #1e293b", padding: "32px 16px", flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#6366f1", marginBottom: 32, paddingLeft: 8 }}>
                    Aporto Publisher
                </div>
                {navLinks.map(l => {
                    const active = l.href === "/publisher" ? pathname === "/publisher" : pathname.startsWith(l.href);
                    return (
                        <Link
                            key={l.href}
                            href={l.href}
                            style={{
                                display: "block", padding: "8px 12px", borderRadius: 6, marginBottom: 4,
                                color: active ? "#e2e8f0" : "#64748b",
                                background: active ? "#1e293b" : "transparent",
                                fontWeight: active ? 500 : 400,
                                fontSize: 14,
                                textDecoration: "none",
                            }}
                        >
                            {l.label}
                        </Link>
                    );
                })}
                <div style={{ marginTop: 32, borderTop: "1px solid #1e293b", paddingTop: 16 }}>
                    <Link href="/dashboard" style={{ display: "block", padding: "8px 12px", color: "#475569", fontSize: 13, textDecoration: "none" }}>
                        ← Back to Dashboard
                    </Link>
                </div>
            </nav>

            {/* Main content */}
            <main style={{ flex: 1, padding: "32px 40px", maxWidth: 900 }}>
                {children}
            </main>
        </div>
    );
}
