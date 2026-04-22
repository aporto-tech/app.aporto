"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

interface SkillDetail {
    id: number; name: string; description: string; status: string;
    reviewNote: string | null; category: string | null; tags: string[];
    paramsSchema: Record<string, unknown>; callCount: number; createdAt: string;
}
interface Provider {
    id: number; name: string; endpoint: string; price_per_call: number;
    cost_per_char: number | null; has_secret: boolean; is_active: boolean;
}
interface Analytics {
    calls: number; successRate: number; avgLatencyMs: number;
    revenue: { grossUSD: number; earnedUSD: number };
    errorBreakdown: Record<string, number>;
}

const STATUS_COLOR: Record<string, string> = {
    draft: "#64748b", pending_review: "#f59e0b", live: "#10b981", rejected: "#ef4444", archived: "#334155",
};

const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 14, boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4, marginTop: 12 };

export default function SkillDetailPage() {
    const params = useParams();
    const router = useRouter();
    const skillId = Number(params.id);
    const [skill, setSkill] = useState<SkillDetail | null>(null);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editData, setEditData] = useState({ name: "", description: "", category: "" });
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [violations, setViolations] = useState<Array<{ field: string; code: string; detail?: string }>>([]);
    const [newProvider, setNewProvider] = useState({ name: "", endpoint: "", providerSecret: "", pricePerCall: "0.01" });
    const [addingProvider, setAddingProvider] = useState(false);

    const getKey = () => localStorage.getItem("publisher_api_key") ?? "";

    const load = async () => {
        const key = getKey();
        if (!key) { setLoading(false); return; }

        const [skillsRes, providersRes, analyticsRes] = await Promise.all([
            fetch("/api/publisher/skills", { headers: { Authorization: `Bearer ${key}` } }),
            fetch(`/api/publisher/providers?skillId=${skillId}`, { headers: { Authorization: `Bearer ${key}` } }),
            fetch(`/api/publisher/analytics?skillId=${skillId}&period=7`, { headers: { Authorization: `Bearer ${key}` } }),
        ]);

        const [sd, pd, ad] = await Promise.all([skillsRes.json(), providersRes.json(), analyticsRes.json()]);

        if (sd.success) {
            const found = (sd.skills ?? []).find((s: SkillDetail) => s.id === skillId);
            if (found) {
                setSkill(found);
                setEditData({ name: found.name, description: found.description, category: found.category ?? "" });
            }
        }
        if (pd.success) setProviders(pd.providers ?? []);
        if (ad.success) setAnalytics(ad);
        setLoading(false);
    };

    useEffect(() => { load(); }, [skillId]);

    const save = async () => {
        setSaving(true); setError("");
        const res = await fetch(`/api/publisher/skills/${skillId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getKey()}` },
            body: JSON.stringify(editData),
        });
        const d = await res.json();
        setSaving(false);
        if (d.success) { setEditing(false); load(); }
        else setError(d.message ?? "Failed to save.");
    };

    const submit = async () => {
        setSubmitting(true); setError(""); setViolations([]);
        const res = await fetch(`/api/publisher/skills/${skillId}/submit`, {
            method: "POST",
            headers: { Authorization: `Bearer ${getKey()}` },
        });
        const d = await res.json();
        setSubmitting(false);
        if (d.success) { load(); }
        else { setError(d.message ?? "Submission failed."); setViolations(d.violations ?? []); }
    };

    const addProvider = async () => {
        setAddingProvider(true); setError("");
        const res = await fetch("/api/publisher/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getKey()}` },
            body: JSON.stringify({ skillId, ...newProvider, pricePerCall: parseFloat(newProvider.pricePerCall) }),
        });
        const d = await res.json();
        setAddingProvider(false);
        if (d.success) {
            setNewProvider({ name: "", endpoint: "", providerSecret: "", pricePerCall: "0.01" });
            load();
        } else {
            setError(d.message ?? "Failed to add provider.");
        }
    };

    if (loading) return <div style={{ color: "#64748b" }}>Loading...</div>;
    if (!skill) return <div style={{ color: "#ef4444" }}>Skill not found.</div>;

    const canEdit = skill.status === "draft" || skill.status === "rejected";
    const canSubmit = skill.status === "draft" || skill.status === "rejected";

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => router.push("/publisher/skills")} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 }}>← Skills</button>
                <span style={{ color: STATUS_COLOR[skill.status] ?? "#64748b", fontWeight: 600, fontSize: 12, padding: "2px 8px", border: `1px solid ${STATUS_COLOR[skill.status] ?? "#64748b"}`, borderRadius: 4 }}>
                    {skill.status.replace("_", " ").toUpperCase()}
                </span>
            </div>

            {skill.status === "rejected" && skill.reviewNote && (
                <div style={{ marginBottom: 20, padding: "12px 16px", background: "#1e0a0a", border: "1px solid #3f1515", borderRadius: 8, color: "#fca5a5", fontSize: 14 }}>
                    <strong>Rejected:</strong> {skill.reviewNote}
                </div>
            )}

            {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}
            {violations.map((v, i) => (
                <div key={i} style={{ color: "#fbbf24", fontSize: 12, marginBottom: 4 }}>
                    ⚠ {v.field}: {v.detail ?? v.code}
                </div>
            ))}

            {/* Skill Details */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 20, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{skill.name}</h2>
                    {canEdit && !editing && (
                        <button onClick={() => setEditing(true)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>Edit</button>
                    )}
                </div>

                {editing ? (
                    <div>
                        <label style={labelStyle}>Name</label>
                        <input value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
                        <label style={labelStyle}>Description</label>
                        <textarea value={editData.description} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))} style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} />
                        <label style={labelStyle}>Category</label>
                        <input value={editData.category} onChange={e => setEditData(p => ({ ...p, category: e.target.value }))} style={inputStyle} />
                        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                            <button onClick={save} disabled={saving} style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer" }}>{saving ? "Saving..." : "Save"}</button>
                            <button onClick={() => setEditing(false)} style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>{skill.category ?? "uncategorized"}</div>
                        <p style={{ color: "#94a3b8", fontSize: 14, margin: 0, lineHeight: 1.6 }}>{skill.description || <em style={{ color: "#475569" }}>No description</em>}</p>
                    </div>
                )}
            </div>

            {/* Analytics */}
            {analytics && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                    {[
                        { label: "Calls (7d)", value: analytics.calls },
                        { label: "Success Rate", value: `${(analytics.successRate * 100).toFixed(1)}%` },
                        { label: "Avg Latency", value: `${analytics.avgLatencyMs}ms` },
                        { label: "Earned (7d)", value: `$${analytics.revenue.earnedUSD.toFixed(4)}` },
                    ].map(c => (
                        <div key={c.label} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: 12 }}>
                            <div style={{ color: "#64748b", fontSize: 11 }}>{c.label}</div>
                            <div style={{ fontWeight: 700, fontSize: 18, marginTop: 2 }}>{c.value}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Providers */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 20, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Providers ({providers.length})</h3>
                {providers.map(p => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #0f172a", fontSize: 13 }}>
                        <div>
                            <span style={{ fontWeight: 500 }}>{p.name}</span>
                            <span style={{ color: "#64748b", marginLeft: 8 }}>{p.endpoint}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, color: "#64748b" }}>
                            <span>${p.price_per_call}/call</span>
                            <span style={{ color: p.has_secret ? "#10b981" : "#ef4444" }}>{p.has_secret ? "✓ secret" : "✗ no secret"}</span>
                        </div>
                    </div>
                ))}

                {canEdit && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1e293b" }}>
                        <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>Add Provider</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                            <input placeholder="Name" value={newProvider.name} onChange={e => setNewProvider(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
                            <input placeholder="https://..." value={newProvider.endpoint} onChange={e => setNewProvider(p => ({ ...p, endpoint: e.target.value }))} style={inputStyle} />
                            <input placeholder="providerSecret (min 32 chars)" value={newProvider.providerSecret} onChange={e => setNewProvider(p => ({ ...p, providerSecret: e.target.value }))} style={inputStyle} type="password" />
                            <input placeholder="Price/call ($)" value={newProvider.pricePerCall} onChange={e => setNewProvider(p => ({ ...p, pricePerCall: e.target.value }))} style={inputStyle} />
                        </div>
                        <button onClick={addProvider} disabled={addingProvider} style={{ marginTop: 8, padding: "7px 14px", borderRadius: 6, border: "none", background: "#1e293b", color: "#e2e8f0", cursor: "pointer", fontSize: 13 }}>
                            {addingProvider ? "Adding..." : "+ Add Provider"}
                        </button>
                    </div>
                )}
            </div>

            {/* Submit for review */}
            {canSubmit && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={submit} disabled={submitting} style={{ padding: "10px 24px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                        {submitting ? "Submitting..." : "Submit for Review"}
                    </button>
                </div>
            )}

            {skill.status === "pending_review" && (
                <div style={{ padding: "12px 16px", background: "#1e1a0a", border: "1px solid #4a3800", borderRadius: 8, color: "#fbbf24", fontSize: 14 }}>
                    Under review. You'll receive an email once the admin has reviewed your skill.
                </div>
            )}
        </div>
    );
}
