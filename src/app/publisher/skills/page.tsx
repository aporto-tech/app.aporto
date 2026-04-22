"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Skill {
    id: number; name: string; description: string; status: string;
    reviewNote: string | null; category: string | null; providerCount: number;
    callCount: number; createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
    draft: "#64748b", pending_review: "#f59e0b", live: "#10b981", rejected: "#ef4444", archived: "#334155",
};

export default function SkillsPage() {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [submissionsUsed, setSubmissionsUsed] = useState(0);
    const [submissionsRemaining, setSubmissionsRemaining] = useState(10);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const key = localStorage.getItem("publisher_api_key");
        if (!key) { setLoading(false); return; }
        fetch("/api/publisher/skills", { headers: { Authorization: `Bearer ${key}` } })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    setSkills(d.skills ?? []);
                    setSubmissionsUsed(d.submissionsUsed ?? 0);
                    setSubmissionsRemaining(d.submissionsRemaining ?? 10);
                }
            })
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ color: "#64748b" }}>Loading...</div>;

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <h1 style={{ fontWeight: 700, fontSize: 24, margin: 0 }}>Skills</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "#64748b", fontSize: 13 }}>{submissionsUsed}/10 pending reviews</span>
                    <Link href="/publisher/skills/new" style={{ padding: "8px 16px", borderRadius: 6, background: "#6366f1", color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
                        + New Skill
                    </Link>
                </div>
            </div>

            {skills.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No skills yet</div>
                    <div style={{ fontSize: 14, marginBottom: 20 }}>Create your first skill and earn revenue per call.</div>
                    <Link href="/publisher/skills/new" style={{ padding: "8px 16px", borderRadius: 6, background: "#6366f1", color: "#fff", textDecoration: "none" }}>
                        Create First Skill
                    </Link>
                </div>
            )}

            {skills.map(s => (
                <Link key={s.id} href={`/publisher/skills/${s.id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                    <div style={{ border: "1px solid #1e293b", borderRadius: 8, padding: 16, marginBottom: 10, background: "#0f172a", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = "#334155")}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e293b")}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                                <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{s.category ?? "uncategorized"} · {s.providerCount} provider(s) · {s.callCount} calls</div>
                            </div>
                            <span style={{ color: STATUS_COLOR[s.status] ?? "#64748b", fontWeight: 600, fontSize: 12, padding: "2px 8px", border: `1px solid ${STATUS_COLOR[s.status] ?? "#64748b"}`, borderRadius: 4 }}>
                                {s.status.replace("_", " ").toUpperCase()}
                            </span>
                        </div>
                        <p style={{ color: "#64748b", fontSize: 13, margin: "8px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.description || <em>No description</em>}
                        </p>
                        {s.status === "rejected" && s.reviewNote && (
                            <div style={{ marginTop: 8, padding: "8px 12px", background: "#1e0a0a", border: "1px solid #3f1515", borderRadius: 6, fontSize: 12, color: "#fca5a5" }}>
                                Rejected: {s.reviewNote}
                            </div>
                        )}
                    </div>
                </Link>
            ))}
        </div>
    );
}
