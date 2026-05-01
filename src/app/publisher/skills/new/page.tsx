"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface AssistantDraft {
    skill?: { name?: string; description?: string; category?: string; tags?: string[]; paramsSchema?: Record<string, unknown> };
    providers?: Array<{ name?: string; endpoint?: string; pricePerCall?: number }>;
}

interface Message { role: "user" | "assistant"; content: string }

type FormStep = "form" | "generating" | "preview";

export default function NewSkillPage() {
    const router = useRouter();

    // Simple form state
    const [docUrl, setDocUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [description, setDescription] = useState("");
    const [submitForReview, setSubmitForReview] = useState(true);
    const [formStep, setFormStep] = useState<FormStep>("form");
    const [progressText, setProgressText] = useState("");
    const [formError, setFormError] = useState("");

    // Preview/edit state
    const [draft, setDraft] = useState<AssistantDraft | null>(null);
    const [editName, setEditName] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [editCategory, setEditCategory] = useState("");
    const [editTags, setEditTags] = useState("");
    const [editEndpoint, setEditEndpoint] = useState("");
    const [editPrice, setEditPrice] = useState("0.01");
    const [saving, setSaving] = useState(false);

    // Chat (advanced) state
    const [showChat, setShowChat] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [thinking, setThinking] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const getKey = () => {
        const key = localStorage.getItem("publisher_api_key");
        if (!key) {
            setFormError("No API key found. Go to API Keys to create one first.");
            return null;
        }
        return key;
    };

    // ── Simple Form Submit ───────────────────────────────────────────────────
    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");

        if (!description.trim()) {
            setFormError("Please describe what your API does.");
            return;
        }

        const key = getKey();
        if (!key) return;

        setFormStep("generating");
        setProgressText("Fetching documentation...");

        try {
            // Build the message for the assistant
            const message = apiKey
                ? `${description.trim()}\n\nThe API key for this provider is: [REDACTED — stored separately]`
                : description.trim();

            setProgressText("Generating skill metadata...");

            const res = await fetch("/api/publisher/assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                body: JSON.stringify({ message, url: docUrl || undefined }),
            });
            const d = await res.json();

            if (!d.success) {
                setFormStep("form");
                setFormError(d.message ?? "Assistant unavailable. Try again later.");
                return;
            }

            if (!d.draft?.skill) {
                setFormStep("form");
                setFormError("Could not parse API documentation. Please provide more detail about what your API does.");
                return;
            }

            // Populate preview
            setDraft(d.draft);
            setEditName(d.draft.skill.name ?? "");
            setEditDesc(d.draft.skill.description ?? "");
            setEditCategory(d.draft.skill.category ?? "");
            setEditTags((d.draft.skill.tags ?? []).join(", "));
            const prov = d.draft.providers?.[0];
            setEditEndpoint(prov?.endpoint ?? "");
            setEditPrice(String(prov?.pricePerCall ?? 0.01));
            setProgressText("");
            setFormStep("preview");
        } catch (e) {
            setFormStep("form");
            setFormError(`Request failed: ${(e as Error).message}`);
        }
    };

    // ── Save from Preview ────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!editName.trim() || !editDesc.trim()) {
            setFormError("Name and description are required.");
            return;
        }

        const key = getKey();
        if (!key) return;

        setSaving(true);
        setFormError("");

        try {
            // Step 1: Create skill
            const res = await fetch("/api/publisher/skills", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                body: JSON.stringify({
                    name: editName.trim(),
                    description: editDesc.trim(),
                    category: editCategory.trim() || undefined,
                    tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
                    paramsSchema: draft?.skill?.paramsSchema ?? undefined,
                }),
            });
            const d = await res.json();

            if (!d.success) {
                setSaving(false);
                setFormError(d.message ?? "Failed to save skill.");
                return;
            }

            const skillId = d.id;

            // Step 2: Create provider (if endpoint provided)
            if (editEndpoint.trim()) {
                const provRes = await fetch("/api/publisher/providers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                    body: JSON.stringify({
                        skillId,
                        name: editName.trim(),
                        endpoint: editEndpoint.trim(),
                        pricePerCall: parseFloat(editPrice) || 0.01,
                        providerSecret: apiKey || undefined,
                    }),
                });
                const provData = await provRes.json();
                if (!provData.success) {
                    // Skill created but provider failed — redirect anyway, user can fix later
                    console.warn("Provider creation failed:", provData.message);
                }
            }

            // Step 3: Submit for review if toggled
            if (submitForReview) {
                const submitRes = await fetch(`/api/publisher/skills/${skillId}/submit`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                });
                const submitData = await submitRes.json();
                if (!submitData.success) {
                    // Skill created but submit failed — redirect to skill page with note
                    console.warn("Auto-submit failed:", submitData.message);
                }
            }

            setSaving(false);
            router.push(`/publisher/skills/${skillId}`);
        } catch (e) {
            setSaving(false);
            setFormError(`Save failed: ${(e as Error).message}`);
        }
    };

    // ── Chat Send ────────────────────────────────────────────────────────────
    const sendChat = async () => {
        if (!chatInput.trim()) return;
        const key = getKey();
        if (!key) return;

        const userMsg: Message = { role: "user", content: chatInput };
        setMessages(prev => [...prev, userMsg]);
        setChatInput("");
        setThinking(true);

        const res = await fetch("/api/publisher/assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ message: chatInput, url: docUrl || undefined }),
        });
        const d = await res.json();
        setThinking(false);

        if (d.success) {
            const cleanReply = d.reply.replace(/```json[\s\S]*?```/g, "[Draft generated — see preview above]");
            setMessages(prev => [...prev, { role: "assistant", content: cleanReply }]);
            if (d.draft) {
                setDraft(d.draft);
                setEditName(d.draft.skill?.name ?? "");
                setEditDesc(d.draft.skill?.description ?? "");
                setEditCategory(d.draft.skill?.category ?? "");
                setEditTags((d.draft.skill?.tags ?? []).join(", "));
                const prov = d.draft.providers?.[0];
                setEditEndpoint(prov?.endpoint ?? "");
                setEditPrice(String(prov?.pricePerCall ?? 0.01));
                setFormStep("preview");
            }
        } else {
            setMessages(prev => [...prev, { role: "assistant", content: `Error: ${d.message}` }]);
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Add Your API to Aporto</h1>
            <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 24 }}>
                Fill in the basics and we'll generate the skill registration for you.
            </p>

            {formError && (
                <div style={{ background: "#1c1917", border: "1px solid #ef4444", borderRadius: 6, padding: "8px 12px", marginBottom: 16, color: "#fca5a5", fontSize: 13 }}>
                    {formError}
                </div>
            )}

            {/* ── STEP: Form ─────────────────────────────────────────────────── */}
            {formStep === "form" && (
                <form onSubmit={handleFormSubmit}>
                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Documentation URL <span style={{ color: "#475569" }}>(optional)</span></label>
                        <input
                            value={docUrl}
                            onChange={e => setDocUrl(e.target.value)}
                            placeholder="https://docs.yourapi.com/v1 or OpenAPI spec URL"
                            style={inputStyle}
                        />
                        <div style={hintStyle}>Link to your API docs, OpenAPI spec, or any page describing your endpoints</div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Your API Key <span style={{ color: "#475569" }}>(optional)</span></label>
                        <input
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder="sk-abc123... or Bearer token"
                            type="password"
                            style={inputStyle}
                        />
                        <div style={hintStyle}>Aporto will use this key to call your API on behalf of agents. Stored encrypted.</div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>What does your API do?</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="e.g. Converts PDF documents to structured text with tables and formatting. Takes a URL or file upload, returns markdown."
                            rows={4}
                            style={{ ...inputStyle, resize: "vertical" }}
                            required
                        />
                        <div style={hintStyle}>1-3 sentences. What input does it take? What output does it return?</div>
                    </div>

                    <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "#e2e8f0" }}>
                            <input
                                type="checkbox"
                                checked={submitForReview}
                                onChange={e => setSubmitForReview(e.target.checked)}
                                style={{ width: 16, height: 16, accentColor: "#6366f1" }}
                            />
                            Submit for review immediately
                        </label>
                        <span style={{ fontSize: 11, color: "#475569" }}>
                            {submitForReview ? "Skill will be reviewed by Aporto team" : "Saved as draft — submit when ready"}
                        </span>
                    </div>

                    <button
                        type="submit"
                        style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "#6366f1", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
                    >
                        Generate Skill →
                    </button>
                </form>
            )}

            {/* ── STEP: Generating ───────────────────────────────────────────── */}
            {formStep === "generating" && (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                    <div style={{ fontSize: 24, marginBottom: 16 }}>⏳</div>
                    <div style={{ color: "#94a3b8", fontSize: 14 }}>{progressText || "Processing..."}</div>
                </div>
            )}

            {/* ── STEP: Preview ──────────────────────────────────────────────── */}
            {formStep === "preview" && (
                <div>
                    <div style={{ background: "#052e16", border: "1px solid #10b981", borderRadius: 6, padding: "8px 12px", marginBottom: 16, fontSize: 13, color: "#a7f3d0" }}>
                        Review the generated fields below. Edit anything that looks wrong, then save.
                    </div>

                    <div style={{ display: "grid", gap: 14 }}>
                        <div>
                            <label style={labelStyle}>Skill Name</label>
                            <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Description</label>
                            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                                <label style={labelStyle}>Category</label>
                                <input value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="e.g. data/transform" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Tags</label>
                                <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="pdf, convert, text" style={inputStyle} />
                            </div>
                        </div>

                        {draft?.providers?.[0] && (
                            <div style={{ borderTop: "1px solid #1e293b", paddingTop: 14 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>PROVIDER (inferred)</div>
                                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                                    <div>
                                        <label style={{ ...labelStyle, fontSize: 11 }}>Endpoint</label>
                                        <input value={editEndpoint} onChange={e => setEditEndpoint(e.target.value)} style={inputStyle} placeholder="https://api.yourservice.com/v1/action" />
                                    </div>
                                    <div>
                                        <label style={{ ...labelStyle, fontSize: 11 }}>Price/call ($)</label>
                                        <input value={editPrice} onChange={e => setEditPrice(e.target.value)} type="number" step="0.001" style={inputStyle} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {draft?.skill?.paramsSchema && (
                            <div>
                                <label style={labelStyle}>Params Schema (inferred)</label>
                                <pre style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: 8, fontSize: 11, color: "#94a3b8", overflow: "auto", maxHeight: 100, margin: 0 }}>
                                    {JSON.stringify(draft.skill.paramsSchema, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                        <button
                            onClick={() => setFormStep("form")}
                            style={{ flex: 1, padding: "10px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}
                        >
                            ← Back
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{ flex: 2, padding: "10px", borderRadius: 6, border: "none", background: submitForReview ? "#6366f1" : "#334155", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
                        >
                            {saving ? "Saving..." : submitForReview ? "Submit for Review" : "Save as Draft"}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Collapsible Chat ───────────────────────────────────────────── */}
            <div style={{ marginTop: 32, borderTop: "1px solid #1e293b", paddingTop: 16 }}>
                <button
                    onClick={() => setShowChat(!showChat)}
                    style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 13, padding: 0 }}
                >
                    {showChat ? "▾ Hide AI assistant chat" : "▸ Need more control? Chat with AI assistant"}
                </button>

                {showChat && (
                    <div style={{ marginTop: 12 }}>
                        <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 8 }}>
                            {messages.length === 0 && (
                                <div style={{ color: "#475569", fontSize: 13, padding: "8px 0" }}>
                                    Describe your API in detail for a more tailored skill registration.
                                </div>
                            )}
                            {messages.map((m, i) => (
                                <div key={i} style={{
                                    marginBottom: 8, padding: "8px 12px", borderRadius: 6,
                                    background: m.role === "user" ? "#1e293b" : "#0f172a",
                                    border: m.role === "assistant" ? "1px solid #1e293b" : "none",
                                    fontSize: 13, lineHeight: 1.5, color: "#e2e8f0", whiteSpace: "pre-wrap",
                                }}>
                                    <span style={{ color: m.role === "user" ? "#6366f1" : "#10b981", fontWeight: 600, fontSize: 10 }}>
                                        {m.role === "user" ? "YOU" : "ASSISTANT"}
                                    </span>
                                    <div style={{ marginTop: 2 }}>{m.content}</div>
                                </div>
                            ))}
                            {thinking && <div style={{ color: "#6366f1", fontSize: 12, padding: 8 }}>Generating...</div>}
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
                            <button onClick={sendChat} disabled={thinking || !chatInput.trim()} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 13 }}>
                                Send
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 6,
    border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0",
    fontSize: 14, boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, color: "#cbd5e1", marginBottom: 4, fontWeight: 500,
};

const hintStyle: React.CSSProperties = {
    fontSize: 11, color: "#475569", marginTop: 4,
};
