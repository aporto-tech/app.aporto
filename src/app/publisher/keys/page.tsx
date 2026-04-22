"use client";

import { useEffect, useState } from "react";

interface ApiKey { id: string; name: string; prefix: string; last_used_at: string | null; revoked_at: string | null; created_at: string }

export default function KeysPage() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [keyName, setKeyName] = useState("New Key");
    const [newKey, setNewKey] = useState("");
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");

    const getKey = () => localStorage.getItem("publisher_api_key") ?? "";

    const load = () => {
        const key = getKey();
        if (!key) { setLoading(false); return; }
        fetch("/api/publisher/keys", { headers: { Authorization: `Bearer ${key}` } })
            .then(r => r.json())
            .then(d => { if (d.success) setKeys(d.keys ?? []); })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const create = async () => {
        setCreating(true); setError("");
        const key = getKey();
        const res = await fetch("/api/publisher/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ name: keyName }),
        });
        const d = await res.json();
        setCreating(false);
        if (d.success) {
            setNewKey(d.key);
            localStorage.setItem("publisher_api_key", d.key);
            load();
        } else setError(d.message ?? "Failed to create key.");
    };

    const revoke = async (id: string) => {
        const key = getKey();
        await fetch(`/api/publisher/keys/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${key}` } });
        load();
    };

    const copy = () => { navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000); };

    if (loading) return <div style={{ color: "#64748b" }}>Loading...</div>;

    return (
        <div>
            <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 24 }}>API Keys</h1>

            {newKey && (
                <div style={{ marginBottom: 24, padding: 16, background: "#0f1f0a", border: "1px solid #15803d", borderRadius: 8 }}>
                    <div style={{ color: "#86efac", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>New key created — copy it now, it won't be shown again.</div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, color: "#a5f3fc", wordBreak: "break-all", marginBottom: 8 }}>{newKey}</div>
                    <button onClick={copy} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #15803d", background: "transparent", color: "#86efac", cursor: "pointer", fontSize: 12 }}>
                        {copied ? "Copied!" : "Copy"}
                    </button>
                </div>
            )}

            {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                <input value={keyName} onChange={e => setKeyName(e.target.value)} style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 14, width: 200 }} placeholder="Key name" />
                <button onClick={create} disabled={creating} style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer" }}>
                    {creating ? "Creating..." : "+ Create Key"}
                </button>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                    <tr style={{ borderBottom: "1px solid #1e293b" }}>
                        {["Name", "Prefix", "Last Used", "Status", ""].map(h => (
                            <th key={h} style={{ textAlign: "left", padding: "6px 0", color: "#64748b", fontWeight: 500 }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {keys.map(k => (
                        <tr key={k.id} style={{ borderBottom: "1px solid #0f172a" }}>
                            <td style={{ padding: "10px 0", fontWeight: 500 }}>{k.name}</td>
                            <td style={{ fontFamily: "monospace", color: "#94a3b8" }}>{k.prefix}...</td>
                            <td style={{ color: "#64748b" }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                            <td>
                                {k.revoked_at
                                    ? <span style={{ color: "#ef4444" }}>Revoked</span>
                                    : <span style={{ color: "#10b981" }}>Active</span>
                                }
                            </td>
                            <td>
                                {!k.revoked_at && (
                                    <button onClick={() => { if (confirm("Revoke this key?")) revoke(k.id); }} style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 11 }}>Revoke</button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
