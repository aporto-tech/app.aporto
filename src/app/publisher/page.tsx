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
    const [pubStatus, setPubStatus] = useState<"loading" | "none" | "pending" | "approved" | "suspended">("loading");
    const [apiKey, setApiKey] = useState("");

    useEffect(() => {
        if (status === "loading") return;
        if (!session) { router.push("/login"); return; }
        // Try to load account info — requires api key from localStorage
        const stored = localStorage.getItem("publisher_api_key");
        if (stored) {
            setApiKey(stored);
            fetch("/api/publisher/account", { headers: { Authorization: `Bearer ${stored}` } })
                .then(r => r.json())
                .then(d => {
                    if (d.success) {
                        setAccount(d.account);
                        setEarnings(d.earnings);
                        setSubmissions(d.submissions);
                        setPubStatus("approved");
                    } else if (d.error === "PUBLISHER_PENDING") {
                        setPubStatus("pending");
                    } else if (d.error === "PUBLISHER_SUSPENDED") {
                        setPubStatus("suspended");
                    } else {
                        setPubStatus("none");
                    }
                })
                .catch(() => setPubStatus("none"));
        } else {
            setPubStatus("none");
        }
    }, [session, status, router]);

    if (status === "loading" || pubStatus === "loading") {
        return <div style={{ color: "#64748b" }}>Loading...</div>;
    }

    if (pubStatus === "none") {
        return <ApplyForm onApplied={() => setPubStatus("pending")} />;
    }

    if (pubStatus === "pending") {
        return (
            <div>
                <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Application Pending</h1>
                <p style={{ color: "#94a3b8" }}>Your publisher application is under review. You'll receive an email once approved.</p>
            </div>
        );
    }

    if (pubStatus === "suspended") {
        return (
            <div>
                <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8, color: "#ef4444" }}>Account Suspended</h1>
                <p style={{ color: "#94a3b8" }}>Your publisher account has been suspended. Contact support for details.</p>
            </div>
        );
    }

    return (
        <div>
            <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 4 }}>Welcome, {account?.displayName}</h1>
            <p style={{ color: "#64748b", marginBottom: 32 }}>Revenue share: {account?.revenueSharePercent} per call</p>

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

function ApplyForm({ onApplied }: { onApplied: () => void }) {
    const [displayName, setDisplayName] = useState("");
    const [website, setWebsite] = useState("");
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        if (!displayName.trim()) { setError("Display name is required."); return; }
        setSubmitting(true);
        const res = await fetch("/api/publisher/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ displayName, website, description }),
        });
        const d = await res.json();
        setSubmitting(false);
        if (d.success) { onApplied(); }
        else setError(d.message ?? "Failed to apply.");
    };

    return (
        <div style={{ maxWidth: 480 }}>
            <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Become a Publisher</h1>
            <p style={{ color: "#94a3b8", marginBottom: 24 }}>List your API as a skill on the Aporto marketplace and earn revenue per call.</p>
            {error && <div style={{ color: "#ef4444", marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <label style={labelStyle}>Display Name *</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} placeholder="Acme AI" />
            <label style={labelStyle}>Website</label>
            <input value={website} onChange={e => setWebsite(e.target.value)} style={inputStyle} placeholder="https://acme.ai" />
            <label style={labelStyle}>What will you build?</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} placeholder="Describe your skill idea..." />
            <button onClick={submit} disabled={submitting} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                {submitting ? "Submitting..." : "Apply to Publish"}
            </button>
        </div>
    );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, color: "#94a3b8", marginBottom: 4, marginTop: 12 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 14, boxSizing: "border-box" };
