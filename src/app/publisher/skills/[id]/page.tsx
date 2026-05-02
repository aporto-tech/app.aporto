"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import useSWR from "swr";
import { Skeleton } from "@/app/components/Skeleton";

interface SubmissionDetail {
    id: number; name: string; description: string; status: string;
    reviewNote: string | null; category: string | null; tags: string[];
    paramsSchema: Record<string, unknown>; resultSkillId: number | null;
    resultProviderId: number | null; createdAt: string;
}
interface Provider {
    id: number; name: string; endpoint: string; price_per_call: number;
    cost_per_char: number | null; has_secret: boolean;
}

const STATUS_COLOR: Record<string, string> = {
    draft: "#64748b", pending: "#f59e0b", reviewing: "#818cf8", approved: "#10b981", rejected: "#ef4444", merged: "#6366f1",
};

const STATUS_LABEL: Record<string, string> = {
    draft: "DRAFT", pending: "PENDING REVIEW", reviewing: "AI REVIEWING", approved: "APPROVED", rejected: "REJECTED", merged: "MERGED",
};

const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 14, boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4, marginTop: 12 };

const getKey = () => localStorage.getItem("publisher_api_key") ?? "";

const publisherFetcher = async (url: string) => {
    const key = getKey();
    if (!key) throw new Error("No key");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const data = await res.json();
    if (!data.success) throw new Error(data.message ?? "Failed");
    return data;
};

export default function SubmissionDetailPage() {
    const params = useParams();
    const router = useRouter();
    const submissionId = Number(params.id);

    const { data: subData, isLoading: subLoading, mutate: mutateSubmission } = useSWR(
        `/api/publisher/skills/${submissionId}`,
        publisherFetcher,
        { revalidateOnFocus: false, dedupingInterval: 10000 }
    );
    const { data: providerData, isLoading: provLoading, mutate: mutateProviders } = useSWR(
        `/api/publisher/providers?submissionId=${submissionId}`,
        publisherFetcher,
        { revalidateOnFocus: false, dedupingInterval: 10000 }
    );

    const submission: SubmissionDetail | null = subData?.submission ?? null;
    const providers: Provider[] = providerData?.providers ?? [];

    const [editing, setEditing] = useState(false);
    const [editData, setEditData] = useState({ name: "", description: "", category: "" });
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [violations, setViolations] = useState<Array<{ field: string; code: string; detail?: string }>>([]);
    const [newProvider, setNewProvider] = useState({ name: "", endpoint: "", providerSecret: "", pricePerCall: "0.01" });
    const [addingProvider, setAddingProvider] = useState(false);

    const save = async () => {
        setSaving(true); setError("");
        const res = await fetch(`/api/publisher/skills/${submissionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getKey()}` },
            body: JSON.stringify(editData),
        });
        const d = await res.json();
        setSaving(false);
        if (d.success) { setEditing(false); mutateSubmission(); }
        else setError(d.message ?? "Failed to save.");
    };

    const submit = async () => {
        setSubmitting(true); setError(""); setViolations([]);
        const res = await fetch(`/api/publisher/skills/${submissionId}/submit`, {
            method: "POST",
            headers: { Authorization: `Bearer ${getKey()}` },
        });
        const d = await res.json();
        setSubmitting(false);
        if (d.success) { mutateSubmission(); }
        else { setError(d.message ?? "Submission failed."); setViolations(d.violations ?? []); }
    };

    const addProvider = async () => {
        setAddingProvider(true); setError("");
        const res = await fetch("/api/publisher/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getKey()}` },
            body: JSON.stringify({ submissionId, ...newProvider, pricePerCall: parseFloat(newProvider.pricePerCall) }),
        });
        const d = await res.json();
        setAddingProvider(false);
        if (d.success) {
            setNewProvider({ name: "", endpoint: "", providerSecret: "", pricePerCall: "0.01" });
            mutateProviders();
        } else {
            setError(d.message ?? "Failed to add provider.");
        }
    };

    const isLoading = subLoading || provLoading;

    if (isLoading) return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <Skeleton width={60} height={14} />
                <Skeleton width={70} height={20} style={{ borderRadius: 4 }} />
            </div>
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 20, marginBottom: 20 }}>
                <Skeleton width="50%" height={20} />
                <Skeleton width="20%" height={12} style={{ marginTop: 10 }} />
                <Skeleton width="80%" height={14} style={{ marginTop: 12 }} />
                <Skeleton width="60%" height={14} style={{ marginTop: 6 }} />
            </div>
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 20 }}>
                <Skeleton width={100} height={15} />
                <Skeleton width="100%" height={13} style={{ marginTop: 12 }} />
            </div>
        </div>
    );

    if (!submission) return <div style={{ color: "#ef4444" }}>Submission not found.</div>;

    const canEdit = submission.status === "draft" || submission.status === "rejected";
    const canSubmit = submission.status === "draft" || submission.status === "rejected";

    const startEditing = () => {
        setEditData({ name: submission.name, description: submission.description, category: submission.category ?? "" });
        setEditing(true);
    };

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => router.push("/publisher/skills")} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 }}>&larr; Skills</button>
                <span style={{ color: STATUS_COLOR[submission.status] ?? "#64748b", fontWeight: 600, fontSize: 12, padding: "2px 8px", border: `1px solid ${STATUS_COLOR[submission.status] ?? "#64748b"}`, borderRadius: 4 }}>
                    {STATUS_LABEL[submission.status] ?? submission.status.toUpperCase()}
                </span>
            </div>

            {submission.status === "rejected" && submission.reviewNote && (
                <div style={{ marginBottom: 20, padding: "12px 16px", background: "#1e0a0a", border: "1px solid #3f1515", borderRadius: 8, color: "#fca5a5", fontSize: 14 }}>
                    <strong>Rejected:</strong> {submission.reviewNote}
                </div>
            )}

            {submission.status === "merged" && submission.resultSkillId && (
                <div style={{ marginBottom: 20, padding: "12px 16px", background: "#0a1e0f", border: "1px solid #15523f", borderRadius: 8, color: "#86efac", fontSize: 14 }}>
                    Your endpoint was merged as a provider to existing skill <strong>#{submission.resultSkillId}</strong>. You earn revenue on every call routed to your provider.
                </div>
            )}

            {submission.status === "approved" && submission.resultSkillId && (
                <div style={{ marginBottom: 20, padding: "12px 16px", background: "#0a1e0f", border: "1px solid #15523f", borderRadius: 8, color: "#86efac", fontSize: 14 }}>
                    Skill created successfully! Your skill is now live as <strong>#{submission.resultSkillId}</strong>.
                </div>
            )}

            {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}
            {violations.map((v, i) => (
                <div key={i} style={{ color: "#fbbf24", fontSize: 12, marginBottom: 4 }}>
                    ⚠ {v.field}: {v.detail ?? v.code}
                </div>
            ))}

            {/* Submission Details */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 20, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{submission.name}</h2>
                    {canEdit && !editing && (
                        <button onClick={startEditing} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>Edit</button>
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
                        <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>{submission.category ?? "uncategorized"}</div>
                        <p style={{ color: "#94a3b8", fontSize: 14, margin: 0, lineHeight: 1.6 }}>{submission.description || <em style={{ color: "#475569" }}>No description</em>}</p>
                    </div>
                )}
            </div>

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

            {submission.status === "pending" && (
                <div style={{ padding: "12px 16px", background: "#1e1a0a", border: "1px solid #4a3800", borderRadius: 8, color: "#fbbf24", fontSize: 14 }}>
                    Under review. You'll receive an email once your submission has been reviewed.
                </div>
            )}

            {submission.status === "reviewing" && (
                <div style={{ padding: "12px 16px", background: "#1a1a2e", border: "1px solid #312e81", borderRadius: 8, color: "#a5b4fc", fontSize: 14 }}>
                    AI is currently reviewing your submission. This usually takes a few seconds.
                </div>
            )}
        </div>
    );
}
