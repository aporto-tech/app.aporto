"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
    const router = useRouter();
    const [keyName, setKeyName] = useState("Production Key");
    const [generatedKey, setGeneratedKey] = useState("");
    const [copied, setCopied] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");

    const storedKey = typeof window !== "undefined" ? localStorage.getItem("publisher_api_key") ?? "" : "";

    const create = async () => {
        const existingKey = localStorage.getItem("publisher_api_key");
        if (!existingKey) { setError("No API key found. Please go to the API Keys page to create one first if you already have an account."); return; }
        setCreating(true);
        const res = await fetch("/api/publisher/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${existingKey}` },
            body: JSON.stringify({ name: keyName }),
        });
        const d = await res.json();
        setCreating(false);
        if (d.success) {
            setGeneratedKey(d.key);
            localStorage.setItem("publisher_api_key", d.key);
        } else {
            setError(d.message ?? "Failed to create key.");
        }
    };

    const copy = () => {
        navigator.clipboard.writeText(generatedKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (generatedKey) {
        return (
            <div style={{ maxWidth: 560 }}>
                <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Your API Key</h1>
                <div style={{ background: "#fef3c7", border: "1px solid #d97706", borderRadius: 6, padding: 12, marginBottom: 20, color: "#92400e", fontSize: 13 }}>
                    ⚠️ This key will only be shown once. Copy it now and store it securely.
                </div>
                <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: 12, fontFamily: "monospace", fontSize: 13, color: "#a5f3fc", wordBreak: "break-all", marginBottom: 12 }}>
                    {generatedKey}
                </div>
                <button onClick={copy} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #334155", background: copied ? "#10b981" : "#1e293b", color: "#e2e8f0", cursor: "pointer", marginRight: 8 }}>
                    {copied ? "Copied!" : "Copy Key"}
                </button>
                <button onClick={() => router.push("/publisher/skills/new")} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer" }}>
                    Create Your First Skill →
                </button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 480 }}>
            <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Create API Key</h1>
            <p style={{ color: "#94a3b8", marginBottom: 24 }}>Create an API key to authenticate your publisher management calls.</p>
            {error && <div style={{ color: "#ef4444", marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <label style={{ display: "block", fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>Key Name</label>
            <input
                value={keyName}
                onChange={e => setKeyName(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 14, boxSizing: "border-box", marginBottom: 16 }}
            />
            <button onClick={create} disabled={creating} style={{ padding: "10px 20px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                {creating ? "Creating..." : "Generate Key"}
            </button>
        </div>
    );
}
