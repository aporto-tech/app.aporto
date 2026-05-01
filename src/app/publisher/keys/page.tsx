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

    const authHeaders = (): HeadersInit => {
        const key = localStorage.getItem("publisher_api_key");
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (key) (headers as Record<string, string>)["Authorization"] = `Bearer ${key}`;
        return headers;
    };

    const load = () => {
        setLoading(true);
        fetch("/api/publisher/keys", { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { if (d.success) setKeys(d.keys ?? []); })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const create = async () => {
        setCreating(true); setError("");
        const res = await fetch("/api/publisher/keys", {
            method: "POST",
            headers: authHeaders(),
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
        if (!confirm("Revoke this key? It will stop working immediately.")) return;
        await fetch(`/api/publisher/keys/${id}`, { method: "DELETE", headers: authHeaders() });
        load();
    };

    const copy = () => { navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000); };

    const activeKeys = keys.filter(k => !k.revoked_at);
    const revokedKeys = keys.filter(k => k.revoked_at);

    return (
        <div>
            <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>API Keys</h1>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>
                API keys are for programmatic access (CI/CD, scripts). The web UI works without them.
            </p>

            {newKey && (
                <div style={{ marginBottom: 24, padding: 16, background: "#0a1a0a", border: "1px solid #00dc82", borderRadius: 8 }}>
                    <div style={{ color: "#00dc82", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>New key created — copy it now, it won't be shown again.</div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, color: "#fff", wordBreak: "break-all", background: "#111", padding: 8, borderRadius: 6, marginBottom: 8 }}>{newKey}</div>
                    <button onClick={copy} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #00dc82", background: "transparent", color: "#00dc82", cursor: "pointer", fontSize: 12 }}>
                        {copied ? "Copied!" : "Copy"}
                    </button>
                </div>
            )}

            {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                <input value={keyName} onChange={e => setKeyName(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #222", background: "#111", color: "#fff", fontSize: 14, width: 200 }} placeholder="Key name" />
                <button onClick={create} disabled={creating} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#00dc82", color: "#000", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                    {creating ? "Creating..." : "+ Create Key"}
                </button>
            </div>

            {loading ? (
                <div style={{ display: "grid", gap: 8 }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{ height: 48, background: "#111", borderRadius: 8, animation: "pulse 1.5s infinite" }} />
                    ))}
                </div>
            ) : keys.length === 0 ? (
                <div style={{ color: "#666", fontSize: 14, padding: "24px 0" }}>
                    No API keys yet. Create one for programmatic access.
                </div>
            ) : (
                <>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                        {activeKeys.length} active · {revokedKeys.length} revoked
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid #222" }}>
                                {["Name", "Prefix", "Created", "Last Used", "Status", ""].map(h => (
                                    <th key={h} style={{ textAlign: "left", padding: "8px 0", color: "#666", fontWeight: 500, fontSize: 12 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map(k => (
                                <tr key={k.id} style={{ borderBottom: "1px solid #111" }}>
                                    <td style={{ padding: "10px 0", fontWeight: 500 }}>{k.name}</td>
                                    <td style={{ fontFamily: "monospace", color: "#888" }}>{k.prefix}...</td>
                                    <td style={{ color: "#666" }}>{new Date(k.created_at).toLocaleDateString()}</td>
                                    <td style={{ color: "#666" }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                                    <td>
                                        {k.revoked_at
                                            ? <span style={{ color: "#ef4444", fontSize: 12 }}>Revoked</span>
                                            : <span style={{ color: "#00dc82", fontSize: 12 }}>Active</span>
                                        }
                                    </td>
                                    <td>
                                        {!k.revoked_at && (
                                            <button onClick={() => revoke(k.id)} style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #333", background: "transparent", color: "#888", cursor: "pointer", fontSize: 11 }}>Revoke</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 0.7; }
                }
            `}</style>
        </div>
    );
}
