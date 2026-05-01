"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PublisherAccount {
    publisherId: string; displayName: string; status: string;
    revenueSharePercent: string; approvedAt: string | null;
}
interface Earnings { totalUnpaidUSD: number }
interface Submissions { used: number; remaining: number; limit: number }

export default function PublisherPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [account, setAccount] = useState<PublisherAccount | null>(null);
    const [earnings, setEarnings] = useState<Earnings | null>(null);
    const [submissions, setSubmissions] = useState<Submissions | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasPublisher, setHasPublisher] = useState(false);

    useEffect(() => {
        if (status === "loading") return;
        if (!session) { router.push("/login"); return; }

        // Check publisher status via session auth (no key needed)
        fetch("/api/publisher/status")
            .then(r => r.json())
            .then(d => {
                if (d.status && d.status !== "none") {
                    setHasPublisher(true);
                    // Load full account data
                    fetch("/api/publisher/account")
                        .then(r => r.json())
                        .then(acc => {
                            if (acc.success) {
                                setAccount(acc.account);
                                setEarnings(acc.earnings);
                                setSubmissions(acc.submissions);
                            }
                        })
                        .finally(() => setLoading(false));
                } else {
                    setHasPublisher(false);
                    setLoading(false);
                }
            })
            .catch(() => setLoading(false));
    }, [session, status, router]);

    if (status === "loading" || loading) {
        return <div style={{ color: "#64748b" }}>Loading...</div>;
    }

    // New user — show get started
    if (!hasPublisher) {
        return <GetStarted />;
    }

    // Existing publisher — dashboard
    return (
        <div>
            <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 4 }}>Welcome, {account?.displayName ?? session?.user?.name}</h1>
            <p style={{ color: "#64748b", marginBottom: 32 }}>Revenue share: {account?.revenueSharePercent ?? "85%"} per call</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
                <StatCard label="Unpaid Earnings" value={`$${(earnings?.totalUnpaidUSD ?? 0).toFixed(4)}`} />
                <StatCard label="Pending Submissions" value={`${submissions?.used ?? 0} / ${submissions?.limit ?? 10}`} />
                <StatCard label="Slots Remaining" value={`${submissions?.remaining ?? 10}`} />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
                <Link href="/publisher/skills/new" style={btnStyle("#6366f1")}>+ New Skill</Link>
                <Link href="/publisher/skills" style={btnStyle("#1e293b")}>View Skills</Link>
                <Link href="/publisher/earnings" style={btnStyle("#1e293b")}>Earnings</Link>
            </div>
        </div>
    );
}

function GetStarted() {
    return (
        <div style={{ maxWidth: 560 }}>
            <h1 style={{ fontWeight: 700, fontSize: 28, marginBottom: 8 }}>Publish Your API</h1>
            <p style={{ color: "#94a3b8", fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>
                Turn your API into a skill that AI agents can discover and call. You earn 85% revenue share on every call.
            </p>

            <div style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>How it works</h2>
                <div style={{ display: "grid", gap: 12 }}>
                    <Step num={1} title="Add your API" desc="Paste your docs URL and API key. Our AI generates the skill registration." />
                    <Step num={2} title="Review & submit" desc="Check the generated metadata, edit if needed, submit for review." />
                    <Step num={3} title="Go live" desc="Once approved, agents discover your skill via semantic search. You get a direct link to share." />
                    <Step num={4} title="Earn per call" desc="Every time an agent calls your skill through Aporto, you earn 85% of the fee." />
                </div>
            </div>

            <Link
                href="/publisher/skills/new"
                style={{
                    display: "inline-block", padding: "12px 24px", borderRadius: 8,
                    background: "#6366f1", color: "#fff", textDecoration: "none",
                    fontSize: 15, fontWeight: 600,
                }}
            >
                Add Your First Skill →
            </Link>

            <p style={{ color: "#475569", fontSize: 12, marginTop: 16 }}>
                No approval needed to start. Your publisher account is created automatically.
            </p>
        </div>
    );
}

function Step({ num, title, desc }: { num: number; title: string; desc: string }) {
    return (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{
                width: 28, height: 28, borderRadius: "50%", background: "#1e293b",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 600, color: "#6366f1", flexShrink: 0,
            }}>
                {num}
            </div>
            <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{title}</div>
                <div style={{ color: "#94a3b8", fontSize: 13 }}>{desc}</div>
            </div>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 16 }}>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{value}</div>
        </div>
    );
}

function btnStyle(bg: string): React.CSSProperties {
    return { display: "inline-block", padding: "8px 16px", borderRadius: 6, background: bg, color: "#e2e8f0", textDecoration: "none", fontSize: 14, fontWeight: 500 };
}
