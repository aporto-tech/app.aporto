"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type Integration = {
    id: string;
    publicId: string;
    name: string;
    repoUrl: string | null;
    status: string;
    revenueSharePercent: string;
    grossUSD: number;
    earningUSD: number;
    unpaidUSD: number;
    paidUSD: number;
    callCount: number;
};

export default function PublisherIntegrationsPage() {
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [name, setName] = useState("");
    const [repoUrl, setRepoUrl] = useState("");
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getKey = () => localStorage.getItem("publisher_api_key") ?? "";

    async function load() {
        const key = getKey();
        if (!key) {
            setLoading(false);
            return;
        }
        const res = await fetch("/api/publisher/integrations", { headers: { Authorization: `Bearer ${key}` } });
        const data = await res.json();
        if (data.success) setIntegrations(data.integrations ?? []);
        setLoading(false);
    }

    useEffect(() => {
        load();
    }, []);

    async function createIntegration(event: FormEvent) {
        event.preventDefault();
        const key = getKey();
        if (!key || creating) return;
        setCreating(true);
        setError(null);
        try {
            const res = await fetch("/api/publisher/integrations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                body: JSON.stringify({ name, repoUrl: repoUrl || undefined }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.message ?? data.error ?? "Could not create integration.");
                return;
            }
            setName("");
            setRepoUrl("");
            await load();
        } finally {
            setCreating(false);
        }
    }

    const totals = useMemo(() => integrations.reduce(
        (acc, item) => ({
            grossUSD: acc.grossUSD + item.grossUSD,
            unpaidUSD: acc.unpaidUSD + item.unpaidUSD,
            paidUSD: acc.paidUSD + item.paidUSD,
            callCount: acc.callCount + item.callCount,
        }),
        { grossUSD: 0, unpaidUSD: 0, paidUSD: 0, callCount: 0 },
    ), [integrations]);

    if (loading) return <div style={{ color: "#64748b" }}>Loading...</div>;

    return (
        <div>
            <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Repo Integrations</h1>
            <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
                Public integration ids can be committed to repositories. Downstream users still pay with their own Aporto API keys.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
                {[
                    ["Calls", totals.callCount.toString()],
                    ["Gross usage", `$${totals.grossUSD.toFixed(4)}`],
                    ["Unpaid", `$${totals.unpaidUSD.toFixed(4)}`],
                    ["Paid", `$${totals.paidUSD.toFixed(4)}`],
                ].map(([label, value]) => (
                    <div key={label} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 14 }}>
                        <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontWeight: 700, fontSize: 20 }}>{value}</div>
                    </div>
                ))}
            </div>

            <form onSubmit={createIntegration} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 16, marginBottom: 24 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Create integration</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, alignItems: "end" }}>
                    <label style={{ display: "grid", gap: 6, color: "#94a3b8", fontSize: 13 }}>
                        Name
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nano Banana Agent"
                            style={{ background: "#020617", border: "1px solid #334155", color: "#e2e8f0", borderRadius: 6, padding: "9px 10px" }} />
                    </label>
                    <label style={{ display: "grid", gap: 6, color: "#94a3b8", fontSize: 13 }}>
                        Repository URL
                        <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/acme/nano-banana-agent"
                            style={{ background: "#020617", border: "1px solid #334155", color: "#e2e8f0", borderRadius: 6, padding: "9px 10px" }} />
                    </label>
                    <button disabled={creating || name.trim().length < 3}
                        style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                        {creating ? "Creating..." : "Create"}
                    </button>
                </div>
                {error && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{error}</div>}
            </form>

            <div style={{ display: "grid", gap: 12 }}>
                {integrations.map((item) => (
                    <div key={item.id} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 16 }}>{item.name}</div>
                                <div style={{ color: "#64748b", fontSize: 13, marginTop: 3 }}>{item.repoUrl ?? "No repository URL"}</div>
                            </div>
                            <div style={{ color: item.status === "approved" ? "#10b981" : "#f59e0b", fontSize: 13, fontWeight: 600 }}>
                                {item.status}
                            </div>
                        </div>

                        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                            <label style={{ color: "#64748b", fontSize: 12 }}>Public integration id</label>
                            <code style={{ display: "block", background: "#020617", border: "1px solid #1e293b", borderRadius: 6, padding: 10, color: "#a5b4fc", overflowX: "auto" }}>
                                {item.publicId}
                            </code>
                        </div>

                        <pre style={{ marginTop: 12, background: "#020617", border: "1px solid #1e293b", borderRadius: 6, padding: 12, color: "#cbd5e1", overflowX: "auto", fontSize: 12 }}>
{`const aporto = new AportoClient({
  apiKey: process.env.APORTO_API_KEY,
  integrationId: "${item.publicId}",
});`}
                        </pre>

                        <div style={{ display: "flex", gap: 16, color: "#94a3b8", fontSize: 13, marginTop: 12, flexWrap: "wrap" }}>
                            <span>Share {item.revenueSharePercent}</span>
                            <span>Calls {item.callCount}</span>
                            <span>Earned ${item.earningUSD.toFixed(4)}</span>
                            <span>Unpaid ${item.unpaidUSD.toFixed(4)}</span>
                        </div>
                    </div>
                ))}

                {integrations.length === 0 && (
                    <div style={{ color: "#64748b", border: "1px dashed #334155", borderRadius: 8, padding: 20 }}>
                        No repository integrations yet.
                    </div>
                )}
            </div>
        </div>
    );
}
