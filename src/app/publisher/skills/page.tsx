"use client";

import Link from "next/link";
import useSWR from "swr";
import { Skeleton } from "@/app/components/Skeleton";

interface Submission {
    id: number; name: string; description: string; status: string;
    reviewNote: string | null; category: string | null;
    resultSkillId: number | null; createdAt: string;
}

interface LiveSkill {
    id: number; name: string; description: string; category: string | null;
    callCount: number; createdAt: string;
}

interface SkillsResponse {
    success: boolean;
    submissions: Submission[];
    liveSkills: LiveSkill[];
    submissionsUsed: number;
    submissionsRemaining: number;
}

const STATUS_COLOR: Record<string, string> = {
    draft: "#64748b", pending: "#f59e0b", reviewing: "#818cf8", approved: "#10b981", rejected: "#ef4444", merged: "#6366f1",
};

const STATUS_LABEL: Record<string, string> = {
    draft: "DRAFT", pending: "PENDING", reviewing: "AI REVIEWING", approved: "APPROVED", rejected: "REJECTED", merged: "APPROVED",
};

const fetcher = async (url: string): Promise<SkillsResponse> => {
    const key = localStorage.getItem("publisher_api_key");
    if (!key) throw new Error("No key");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const data = await res.json();
    if (!data.success) throw new Error(data.message ?? "Failed");
    return data;
};

export default function SkillsPage() {
    const { data, isLoading } = useSWR<SkillsResponse>("/api/publisher/skills", fetcher, {
        revalidateOnFocus: false,
        dedupingInterval: 10000,
    });

    const submissions = data?.submissions ?? [];
    const liveSkills = data?.liveSkills ?? [];
    const submissionsUsed = data?.submissionsUsed ?? 0;

    if (isLoading) return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <Skeleton width={80} height={24} />
                <Skeleton width={120} height={36} style={{ borderRadius: 6 }} />
            </div>
            {[1, 2, 3].map(i => (
                <div key={i} style={{ border: "1px solid #1e293b", borderRadius: 8, padding: 16, marginBottom: 10, background: "#0f172a" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                            <Skeleton width="40%" height={16} />
                            <Skeleton width="25%" height={12} style={{ marginTop: 6 }} />
                        </div>
                        <Skeleton width={60} height={20} style={{ borderRadius: 4 }} />
                    </div>
                    <Skeleton width="70%" height={13} style={{ marginTop: 10 }} />
                </div>
            ))}
        </div>
    );

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <h1 style={{ fontWeight: 700, fontSize: 24, margin: 0 }}>Skills</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "#64748b", fontSize: 13 }}>{submissionsUsed}/10 pending</span>
                    <Link href="/publisher/skills/new" style={{ padding: "8px 16px", borderRadius: 6, background: "#6366f1", color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
                        + New Skill
                    </Link>
                </div>
            </div>

            {/* Live Skills */}
            {liveSkills.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <div style={{ color: "#10b981", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Live Skills</div>
                    {liveSkills.map(s => (
                        <div key={`live-${s.id}`} style={{ border: "1px solid #1e293b", borderRadius: 8, padding: 16, marginBottom: 10, background: "#0f172a" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                                    <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{s.category ?? "uncategorized"} · {s.callCount} calls</div>
                                </div>
                                <span style={{ color: "#10b981", fontWeight: 600, fontSize: 12, padding: "2px 8px", border: "1px solid #10b981", borderRadius: 4 }}>LIVE</span>
                            </div>
                            <p style={{ color: "#64748b", fontSize: 13, margin: "8px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.description || <em>No description</em>}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Submissions */}
            {submissions.length > 0 && (
                <div>
                    <div style={{ color: "#64748b", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Submissions</div>
                    {submissions.map(s => (
                        <Link key={s.id} href={`/publisher/skills/${s.id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                            <div style={{ border: "1px solid #1e293b", borderRadius: 8, padding: 16, marginBottom: 10, background: "#0f172a", cursor: "pointer" }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = "#334155")}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e293b")}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                                        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{s.category ?? "uncategorized"}</div>
                                    </div>
                                    <span style={{ color: STATUS_COLOR[s.status] ?? "#64748b", fontWeight: 600, fontSize: 12, padding: "2px 8px", border: `1px solid ${STATUS_COLOR[s.status] ?? "#64748b"}`, borderRadius: 4 }}>
                                        {STATUS_LABEL[s.status] ?? s.status.toUpperCase()}
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
                                {s.status === "merged" && s.resultSkillId && (
                                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#0a1e0f", border: "1px solid #15523f", borderRadius: 6, fontSize: 12, color: "#86efac" }}>
                                        Skill approved: #{s.resultSkillId}
                                    </div>
                                )}
                                {s.status === "approved" && s.resultSkillId && (
                                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#0a1e0f", border: "1px solid #15523f", borderRadius: 6, fontSize: 12, color: "#86efac" }}>
                                        Skill created: #{s.resultSkillId}
                                    </div>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {submissions.length === 0 && liveSkills.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No skills yet</div>
                    <div style={{ fontSize: 14, marginBottom: 20 }}>Create your first skill and earn revenue per call.</div>
                    <Link href="/publisher/skills/new" style={{ padding: "8px 16px", borderRadius: 6, background: "#6366f1", color: "#fff", textDecoration: "none" }}>
                        Create First Skill
                    </Link>
                </div>
            )}
        </div>
    );
}
