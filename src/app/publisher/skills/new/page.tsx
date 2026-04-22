"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface AssistantDraft {
    skill?: { name?: string; description?: string; category?: string; tags?: string[]; paramsSchema?: Record<string, unknown> };
    providers?: Array<{ name?: string; endpoint?: string; pricePerCall?: number }>;
}

interface Message { role: "user" | "assistant"; content: string }

export default function NewSkillPage() {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [url, setUrl] = useState("");
    const [draft, setDraft] = useState<AssistantDraft | null>(null);
    const [thinking, setThinking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const send = async () => {
        if (!input.trim()) return;
        const key = localStorage.getItem("publisher_api_key");
        if (!key) { setError("No API key found. Please create one in API Keys."); return; }

        const userMsg: Message = { role: "user", content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setThinking(true);

        const res = await fetch("/api/publisher/assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ message: input, url: url || undefined }),
        });
        const d = await res.json();
        setThinking(false);

        if (d.success) {
            setMessages(prev => [...prev, { role: "assistant", content: d.reply }]);
            if (d.draft) setDraft(d.draft);
        } else {
            setMessages(prev => [...prev, { role: "assistant", content: `Error: ${d.message}` }]);
        }
    };

    const saveDraft = async () => {
        if (!draft?.skill) return;
        const key = localStorage.getItem("publisher_api_key");
        if (!key) return;
        setSaving(true);
        const res = await fetch("/api/publisher/skills", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                name: draft.skill.name ?? "Untitled Skill",
                description: draft.skill.description ?? "",
                category: draft.skill.category,
                tags: draft.skill.tags,
                paramsSchema: draft.skill.paramsSchema,
            }),
        });
        const d = await res.json();
        setSaving(false);
        if (d.success) { router.push(`/publisher/skills/${d.id}`); }
        else setError(d.message ?? "Failed to save draft.");
    };

    return (
        <div style={{ display: "flex", gap: 24, height: "calc(100vh - 64px)" }}>
            {/* Chat panel */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <h1 style={{ fontWeight: 700, fontSize: 22, marginBottom: 16, flexShrink: 0 }}>AI Skill Assistant</h1>
                {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>{error}</div>}

                <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
                    {messages.length === 0 && (
                        <div style={{ color: "#475569", fontSize: 14, padding: "20px 0" }}>
                            Describe your API and I'll help you draft a skill registration.
                            Example: "I have a PDF summarizer at https://api.example.com/v1/summarize — it takes a URL and returns a summary."
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} style={{
                            marginBottom: 12, padding: "10px 14px", borderRadius: 8,
                            background: m.role === "user" ? "#1e293b" : "#0f172a",
                            border: m.role === "assistant" ? "1px solid #1e293b" : "none",
                            fontSize: 14, lineHeight: 1.6, color: "#e2e8f0",
                            whiteSpace: "pre-wrap",
                        }}>
                            <div style={{ color: m.role === "user" ? "#6366f1" : "#10b981", fontWeight: 600, fontSize: 11, marginBottom: 4 }}>
                                {m.role === "user" ? "YOU" : "ASSISTANT"}
                            </div>
                            {m.content.replace(/```json[\s\S]*?```/g, "[Draft generated above →]")}
                        </div>
                    ))}
                    {thinking && (
                        <div style={{ color: "#64748b", fontSize: 13, padding: "8px 0" }}>Thinking...</div>
                    )}
                    <div ref={bottomRef} />
                </div>

                <div style={{ flexShrink: 0 }}>
                    <input
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        style={inputStyle}
                        placeholder="Optional: paste your API endpoint URL or OpenAPI spec URL"
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
                            style={{ ...inputStyle, flex: 1, margin: 0 }}
                            placeholder="Describe your API..."
                        />
                        <button onClick={send} disabled={thinking || !input.trim()} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer" }}>
                            Send
                        </button>
                    </div>
                </div>
            </div>

            {/* Draft panel */}
            {draft?.skill && (
                <div style={{ width: 300, flexShrink: 0, border: "1px solid #1e293b", borderRadius: 8, padding: 16, background: "#0f172a", overflowY: "auto" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: "#10b981" }}>Draft</div>
                    <Field label="Name" value={draft.skill.name} />
                    <Field label="Category" value={draft.skill.category} />
                    <Field label="Tags" value={draft.skill.tags?.join(", ")} />
                    <Field label="Description" value={draft.skill.description} multiline />
                    {draft.providers?.map((p, i) => (
                        <div key={i} style={{ marginTop: 12, padding: 10, background: "#1e293b", borderRadius: 6 }}>
                            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>PROVIDER {i + 1}</div>
                            <Field label="Name" value={p.name} />
                            <Field label="Endpoint" value={p.endpoint} />
                            <Field label="Price/call" value={p.pricePerCall != null ? `$${p.pricePerCall}` : undefined} />
                        </div>
                    ))}
                    <button
                        onClick={saveDraft}
                        disabled={saving}
                        style={{ width: "100%", marginTop: 16, padding: "8px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 600 }}
                    >
                        {saving ? "Saving..." : "Save Draft"}
                    </button>
                    <div style={{ marginTop: 8, fontSize: 11, color: "#475569", textAlign: "center" }}>
                        Review all fields before saving. This is a draft only.
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
    if (!value) return null;
    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, color: "#e2e8f0", ...(multiline ? { whiteSpace: "pre-wrap" } : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }) }}>
                {value}
            </div>
        </div>
    );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 14, boxSizing: "border-box" };
