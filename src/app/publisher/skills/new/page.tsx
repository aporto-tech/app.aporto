"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Message { role: "user" | "assistant"; content: string }

export default function NewSkillPage() {
    const router = useRouter();

    // Form state
    const [docUrl, setDocUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [description, setDescription] = useState("");
    const [skillName, setSkillName] = useState("");
    const [autoPublish, setAutoPublish] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");

    // Chat (advanced) state
    const [showChat, setShowChat] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [thinking, setThinking] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const authHeaders = (): HeadersInit => {
        const key = typeof window !== "undefined" ? localStorage.getItem("publisher_api_key") : null;
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (key) (headers as Record<string, string>)["Authorization"] = `Bearer ${key}`;
        return headers;
    };

    // ── Submit skill for review ──────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");

        if (!description.trim()) {
            setFormError("Please describe what your API does.");
            return;
        }
        if (!skillName.trim()) {
            setFormError("Please provide a skill name.");
            return;
        }

        setSaving(true);

        try {
            // Step 1: Create skill as draft
            const res = await fetch("/api/publisher/skills", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    name: skillName.trim(),
                    description: description.trim(),
                    // Store doc URL and auto-publish preference in metadata
                }),
            });
            const d = await res.json();

            if (!d.success) {
                setSaving(false);
                setFormError(d.message ?? "Failed to create skill.");
                return;
            }

            const skillId = d.id;

            // Step 2: Create provider with endpoint from docs + API key
            if (docUrl.trim() || apiKey.trim()) {
                await fetch("/api/publisher/providers", {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({
                        skillId,
                        name: skillName.trim(),
                        endpoint: docUrl.trim() || "pending-configuration",
                        pricePerCall: 0.01,
                        providerSecret: apiKey.trim() || undefined,
                    }),
                });
            }

            // Step 3: Submit for review
            await fetch(`/api/publisher/skills/${skillId}/submit`, {
                method: "POST",
                headers: authHeaders(),
            });

            setSaving(false);
            router.push(`/publisher/skills/${skillId}`);
        } catch (e) {
            setSaving(false);
            setFormError(`Failed: ${(e as Error).message}`);
        }
    };

    // ── Chat Send (advanced) ─────────────────────────────────────────────────
    const sendChat = async () => {
        if (!chatInput.trim()) return;

        const userMsg: Message = { role: "user", content: chatInput };
        setMessages(prev => [...prev, userMsg]);
        setChatInput("");
        setThinking(true);

        const res = await fetch("/api/publisher/assistant", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ message: chatInput, url: docUrl || undefined }),
        });
        const d = await res.json();
        setThinking(false);

        if (d.success) {
            const cleanReply = d.reply.replace(/```json[\s\S]*?```/g, "[Draft generated]");
            setMessages(prev => [...prev, { role: "assistant", content: cleanReply }]);
            if (d.draft?.skill) {
                setSkillName(d.draft.skill.name ?? "");
                setDescription(d.draft.skill.description ?? "");
            }
        } else {
            setMessages(prev => [...prev, { role: "assistant", content: `Error: ${d.message}` }]);
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div style={{ maxWidth: 560 }}>
            <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Add Your API</h1>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>
                Submit your API details. Our team will review, configure the skill, and publish it.
            </p>

            {formError && (
                <div style={{ background: "#1a0000", border: "1px solid #ef4444", borderRadius: 8, padding: "8px 12px", marginBottom: 16, color: "#fca5a5", fontSize: 13 }}>
                    {formError}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Skill Name *</label>
                    <input
                        value={skillName}
                        onChange={e => setSkillName(e.target.value)}
                        placeholder="e.g. PDF Summarizer, Weather API, Image Resize"
                        style={inputStyle}
                        required
                    />
                    <div style={hintStyle}>Short name for your skill as it will appear in the marketplace</div>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>What does your API do? *</label>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="e.g. Converts PDF documents to structured text. Takes a URL, returns markdown with tables and formatting preserved."
                        rows={4}
                        style={{ ...inputStyle, resize: "vertical" }}
                        required
                    />
                    <div style={hintStyle}>1-3 sentences. What input does it take? What output does it return?</div>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Documentation URL</label>
                    <input
                        value={docUrl}
                        onChange={e => setDocUrl(e.target.value)}
                        placeholder="https://docs.yourapi.com/v1"
                        style={inputStyle}
                    />
                    <div style={hintStyle}>Link to your API docs or OpenAPI spec. Helps our team configure the skill faster.</div>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>API Key for Aporto</label>
                    <input
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="sk-abc123... or Bearer token"
                        type="password"
                        style={inputStyle}
                    />
                    <div style={hintStyle}>A key you generated on your service for Aporto to make requests. Stored encrypted.</div>
                </div>

                <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "#fff" }}>
                        <input
                            type="checkbox"
                            checked={autoPublish}
                            onChange={e => setAutoPublish(e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: "#00dc82" }}
                        />
                        Auto-publish after review
                    </label>
                    <span style={{ fontSize: 11, color: "#666" }}>
                        {autoPublish ? "Goes live automatically once approved" : "You'll publish manually after approval"}
                    </span>
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    style={{
                        width: "100%", padding: "12px", borderRadius: 8, border: "none",
                        background: "#00dc82", color: "#000", fontSize: 14, fontWeight: 600,
                        cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1,
                    }}
                >
                    {saving ? "Submitting..." : "Submit for Review"}
                </button>
            </form>

            {/* ── Collapsible Chat ───────────────────────────────────────────── */}
            <div style={{ marginTop: 32, borderTop: "1px solid #222", paddingTop: 16 }}>
                <button
                    onClick={() => setShowChat(!showChat)}
                    style={{ background: "none", border: "none", color: "#00dc82", cursor: "pointer", fontSize: 13, padding: 0 }}
                >
                    {showChat ? "▾ Hide AI assistant" : "▸ Need help describing your API? Chat with AI assistant"}
                </button>

                {showChat && (
                    <div style={{ marginTop: 12 }}>
                        <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 8 }}>
                            {messages.length === 0 && (
                                <div style={{ color: "#666", fontSize: 13, padding: "8px 0" }}>
                                    Describe your API and I'll help you write the name and description.
                                </div>
                            )}
                            {messages.map((m, i) => (
                                <div key={i} style={{
                                    marginBottom: 8, padding: "8px 12px", borderRadius: 8,
                                    background: m.role === "user" ? "#111" : "#0a0a0a",
                                    border: m.role === "assistant" ? "1px solid #222" : "none",
                                    fontSize: 13, lineHeight: 1.5, color: "#fff", whiteSpace: "pre-wrap",
                                }}>
                                    <span style={{ color: m.role === "user" ? "#00dc82" : "#888", fontWeight: 600, fontSize: 10 }}>
                                        {m.role === "user" ? "YOU" : "ASSISTANT"}
                                    </span>
                                    <div style={{ marginTop: 2 }}>{m.content}</div>
                                </div>
                            ))}
                            {thinking && <div style={{ color: "#00dc82", fontSize: 12, padding: 8 }}>Generating...</div>}
                            <div ref={bottomRef} />
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                                placeholder="Describe your API..."
                                style={{ ...inputStyle, flex: 1 }}
                                disabled={thinking}
                            />
                            <button onClick={sendChat} disabled={thinking || !chatInput.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#222", color: "#fff", cursor: "pointer", fontSize: 13 }}>
                                Send
                            </button>
                        </div>
                        <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
                            The assistant helps you write the description. It fills in the form fields above.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1px solid #222", background: "#111", color: "#fff",
    fontSize: 14, boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, color: "#888", marginBottom: 4, fontWeight: 500,
};

const hintStyle: React.CSSProperties = {
    fontSize: 11, color: "#666", marginTop: 4,
};
