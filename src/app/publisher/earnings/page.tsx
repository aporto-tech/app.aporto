"use client";

import { useEffect, useState } from "react";

interface CallRow { id: number; createdAt: string; success: boolean | null; latencyMs: number | null; costUSD: number | null; earnedUSD: number | null; errorType: string | null }
interface Skill { id: number; name: string }

export default function EarningsPage() {
    const [account, setAccount] = useState<{ totalUnpaidUSD: number; revenueSharePercent: string } | null>(null);
    const [skills, setSkills] = useState<Skill[]>([]);
    const [selectedSkill, setSelectedSkill] = useState<number | null>(null);
    const [calls, setCalls] = useState<CallRow[]>([]);
    const [cursor, setCursor] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    const getKey = () => localStorage.getItem("publisher_api_key") ?? "";

    useEffect(() => {
        const key = getKey();
        if (!key) { setLoading(false); return; }
        Promise.all([
            fetch("/api/publisher/account", { headers: { Authorization: `Bearer ${key}` } }).then(r => r.json()),
            fetch("/api/publisher/skills", { headers: { Authorization: `Bearer ${key}` } }).then(r => r.json()),
        ]).then(([ad, sd]) => {
            if (ad.success) setAccount({ totalUnpaidUSD: ad.earnings.totalUnpaidUSD, revenueSharePercent: ad.account.revenueSharePercent });
            if (sd.success) setSkills(sd.skills?.map((s: Skill) => ({ id: s.id, name: (s as { name: string }).name })) ?? []);
        }).finally(() => setLoading(false));
    }, []);

    const loadCalls = async (skillId: number, cur?: number) => {
        const key = getKey();
        const url = `/api/publisher/calls?skillId=${skillId}&limit=50${cur ? `&cursor=${cur}` : ""}`;
        const d = await fetch(url, { headers: { Authorization: `Bearer ${key}` } }).then(r => r.json());
        if (d.success) {
            setCalls(prev => cur ? [...prev, ...(d.calls ?? [])] : (d.calls ?? []));
            setCursor(d.nextCursor);
        }
    };

    const selectSkill = (id: number) => { setSelectedSkill(id); setCalls([]); setCursor(null); loadCalls(id); };

    if (loading) return <div style={{ color: "#64748b" }}>Loading...</div>;

    return (
        <div>
            <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Earnings</h1>
            <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>Revenue share: {account?.revenueSharePercent ?? "—"} · Payouts are processed manually.</p>

            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 16, marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>Unpaid Balance</div>
                    <div style={{ fontWeight: 700, fontSize: 28 }}>${(account?.totalUnpaidUSD ?? 0).toFixed(4)}</div>
                </div>
                <div style={{ fontSize: 13, color: "#475569", maxWidth: 280 }}>
                    To request a payout, contact <a href="mailto:support@aporto.tech" style={{ color: "#6366f1" }}>support@aporto.tech</a> with your publisher ID.
                </div>
            </div>

            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 8 }}>Select skill to view call log:</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {skills.map(s => (
                        <button key={s.id} onClick={() => selectSkill(s.id)}
                            style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${selectedSkill === s.id ? "#6366f1" : "#334155"}`, background: selectedSkill === s.id ? "#1e1b4b" : "transparent", color: selectedSkill === s.id ? "#a5b4fc" : "#94a3b8", cursor: "pointer", fontSize: 13 }}>
                            {s.name}
                        </button>
                    ))}
                </div>
            </div>

            {calls.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                        <tr style={{ borderBottom: "1px solid #1e293b" }}>
                            {["Time", "Success", "Latency", "Cost", "Earned", "Error"].map(h => (
                                <th key={h} style={{ textAlign: "left", padding: "6px 0", color: "#64748b" }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {calls.map(c => (
                            <tr key={c.id} style={{ borderBottom: "1px solid #0f172a" }}>
                                <td style={{ padding: "8px 0", color: "#64748b" }}>{new Date(c.createdAt).toLocaleString()}</td>
                                <td style={{ color: c.success ? "#10b981" : "#ef4444" }}>{c.success ? "✓" : "✗"}</td>
                                <td style={{ color: "#94a3b8" }}>{c.latencyMs != null ? `${c.latencyMs}ms` : "—"}</td>
                                <td style={{ color: "#94a3b8" }}>{c.costUSD != null ? `$${c.costUSD.toFixed(5)}` : "—"}</td>
                                <td style={{ color: "#10b981" }}>{c.earnedUSD != null ? `$${c.earnedUSD.toFixed(5)}` : "—"}</td>
                                <td style={{ color: "#ef4444" }}>{c.errorType ?? ""}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {cursor && (
                <button onClick={() => selectedSkill && loadCalls(selectedSkill, cursor)}
                    style={{ marginTop: 12, padding: "7px 14px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>
                    Load more
                </button>
            )}
        </div>
    );
}
