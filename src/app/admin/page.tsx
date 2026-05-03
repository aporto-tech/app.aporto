"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";

const ADMIN_EMAILS = new Set(["pevzner@aporto.tech", "it@aporto.tech"]);

// ── Types ─────────────────────────────────────────────────────────────────────

interface Redemption {
    userId: string;
    redeemedAt: string;
    email: string | null;
    name: string | null;
}
interface PromoCode {
    id: string;
    code: string;
    creditUSD: number;
    maxUses: number;
    usedCount: number;
    expiresAt: string | null;
    createdAt: string;
    redemptions: Redemption[];
}
interface Skill {
    id: number;
    name: string;
    description: string;
    params_schema: string | null;
    tags: string | null;
    is_active: boolean;
    created_at: string;
    provider_count: number;
    call_count: number;
}
interface Provider {
    id: number;
    skillId: number;
    name: string;
    endpoint: string;
    pricePerCall: number;
    avgLatencyMs: number;
    retryRate: number;
    timeoutRate: number;
    isActive: boolean;
    createdAt: string;
}

interface StatsOverview {
    totalCalls: number;
    successRate: number;
    avgLatencyMs: number;
    retryRate: number;
    errorBreakdown: {
        success: number;
        timeout: number;
        error_5xx: number;
        error_4xx: number;
        network_error: number;
    };
}
interface StatsSkill {
    id: number;
    name: string;
    calls: number;
    successRate: number;
    avgLatencyMs: number;
}
interface StatsProvider {
    id: number;
    name: string;
    skillName: string;
    calls: number;
    successRate: number;
    avgLatencyMs: number;
    retryRate: number;
    timeoutRate: number;
}
interface StatsDayVolume {
    day: string;
    calls: number;
    successCalls: number;
}
interface StatsData {
    overview: StatsOverview;
    topSkills: StatsSkill[];
    providers: StatsProvider[];
    dailyVolume: StatsDayVolume[];
}

type Tab = "promo" | "skills" | "stats" | "pending" | "publishers";

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>("promo");

    useEffect(() => {
        if (status === "loading") return;
        if (!session || !ADMIN_EMAILS.has((session.user as any)?.email ?? "")) {
            router.push("/dashboard");
        }
    }, [session, status, router]);

    if (status === "loading") {
        return <div className={styles.container} style={{ color: "#64748b" }}>Loading...</div>;
    }
    if (!session || !ADMIN_EMAILS.has((session.user as any)?.email ?? "")) {
        return null;
    }

    return (
        <div className={styles.container} style={{ minWidth: 1024 }}>
            <div className={styles.header}>
                <h1>Admin</h1>
            </div>

            {/* Tab bar */}
            <div className={styles.tabBar}>
                {(["promo", "skills", "stats", "pending", "publishers"] as Tab[]).map((t) => (
                    <button
                        key={t}
                        className={`${styles.tabBtn} ${activeTab === t ? styles.tabBtnActive : ""}`}
                        onClick={() => setActiveTab(t)}
                    >
                        {t === "promo" ? "Promo Codes" : t === "skills" ? "Skills & Providers" : t === "stats" ? "Stats" : t === "pending" ? "Pending Review" : "Publishers"}
                    </button>
                ))}
            </div>

            {activeTab === "promo" && <PromoTab />}
            {activeTab === "skills" && <SkillsTab />}
            {activeTab === "stats" && <StatsTab />}
            {activeTab === "pending" && <PendingReviewTab />}
            {activeTab === "publishers" && <PublishersTab />}
        </div>
    );
}

// ── Promo Codes Tab ───────────────────────────────────────────────────────────

function PromoTab() {
    const [codes, setCodes] = useState<PromoCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [formCode, setFormCode] = useState("");
    const [formCredit, setFormCredit] = useState("60");
    const [formMaxUses, setFormMaxUses] = useState("1");
    const [formExpires, setFormExpires] = useState("");
    const [formError, setFormError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => { fetchCodes(); }, []);

    async function fetchCodes() {
        setLoading(true);
        const res = await fetch("/api/admin/promo");
        const data = await res.json();
        setCodes(data.codes ?? []);
        setLoading(false);
    }

    async function handleDelete(id: string, code: string) {
        if (!confirm(`Delete code ${code}? This cannot be undone.`)) return;
        await fetch(`/api/admin/promo/${id}`, { method: "DELETE" });
        setCodes(prev => prev.filter(c => c.id !== id));
    }

    async function handleGenerate(e: React.FormEvent) {
        e.preventDefault();
        setFormError("");
        const credit = parseFloat(formCredit);
        if (!credit || credit <= 0) { setFormError("Credit must be greater than 0."); return; }
        setSubmitting(true);
        const res = await fetch("/api/admin/promo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: formCode.trim() || undefined, creditUSD: credit, maxUses: parseInt(formMaxUses) || 1, expiresAt: formExpires || undefined }),
        });
        const data = await res.json();
        setSubmitting(false);
        if (!res.ok) { setFormError(data.error ?? "Failed to create code."); return; }
        setShowModal(false);
        setFormCode(""); setFormCredit("60"); setFormMaxUses("1"); setFormExpires("");
        fetchCodes();
    }

    const allRedemptions = codes
        .flatMap(c => c.redemptions.map(r => ({ ...r, code: c.code, creditUSD: c.creditUSD })))
        .sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime())
        .slice(0, 20);

    if (loading) return <div className={styles.tabLoading}>Loading...</div>;

    return (
        <>
            <div className={styles.tabHeader}>
                <span />
                <button className={styles.generateBtn} onClick={() => setShowModal(true)}>+ Generate Code</button>
            </div>

            <div className={styles.section}>
                <p className={styles.sectionTitle}>Active Codes</p>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead><tr><th>Code</th><th>Credit</th><th>Uses</th><th>Expires</th><th>Created</th><th></th></tr></thead>
                        <tbody>
                            {codes.length === 0
                                ? <tr className={styles.emptyRow}><td colSpan={6}>No promo codes yet.</td></tr>
                                : codes.map(c => (
                                    <tr key={c.id}>
                                        <td><span className={styles.codeBadge}>{c.code}</span></td>
                                        <td>${c.creditUSD.toFixed(2)}</td>
                                        <td>{c.usedCount}/{c.maxUses}</td>
                                        <td>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}</td>
                                        <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                                        <td><button className={styles.deleteBtn} onClick={() => handleDelete(c.id, c.code)}>Delete</button></td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            <div className={styles.section}>
                <p className={styles.sectionTitle}>Recent Redemptions</p>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead><tr><th>Email</th><th>Code</th><th>Credit</th><th>Redeemed At</th></tr></thead>
                        <tbody>
                            {allRedemptions.length === 0
                                ? <tr className={styles.emptyRow}><td colSpan={4}>No redemptions yet.</td></tr>
                                : allRedemptions.map((r, i) => (
                                    <tr key={i}>
                                        <td>{r.email ?? r.userId}</td>
                                        <td><span className={styles.codeBadge}>{r.code}</span></td>
                                        <td>${r.creditUSD.toFixed(2)}</td>
                                        <td>{new Date(r.redeemedAt).toLocaleString()}</td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className={styles.overlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2>Generate Promo Code</h2>
                        <form onSubmit={handleGenerate}>
                            <div className={styles.formGroup}>
                                <label>Code <span className={styles.hint}>(leave blank to auto-generate)</span></label>
                                <input className={styles.formInput} type="text" placeholder="e.g. BETA-A7K3M2" value={formCode} onChange={e => setFormCode(e.target.value.toUpperCase())} style={{ textTransform: "uppercase" }} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Credit (USD)</label>
                                <input className={styles.formInput} type="number" min="0.01" step="0.01" placeholder="60" value={formCredit} onChange={e => setFormCredit(e.target.value)} required />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Max Uses</label>
                                <input className={styles.formInput} type="number" min="1" placeholder="1" value={formMaxUses} onChange={e => setFormMaxUses(e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Expires <span className={styles.hint}>(optional)</span></label>
                                <input className={styles.formInput} type="date" value={formExpires} onChange={e => setFormExpires(e.target.value)} style={{ colorScheme: "dark" }} />
                            </div>
                            {formError && <p className={styles.error}>{formError}</p>}
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className={styles.submitBtn} disabled={submitting}>{submitting ? "Creating..." : "Create Code"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

// ── Skills + Providers Tab ────────────────────────────────────────────────────

function SkillsTab() {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
    const [showCreateSkill, setShowCreateSkill] = useState(false);
    const [showAiOnboard, setShowAiOnboard] = useState(false);
    const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

    useEffect(() => { fetchSkills(); }, []);

    async function fetchSkills() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/skills");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setSkills(data.skills ?? []);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }

    async function handleToggleActive(skill: Skill) {
        const action = skill.is_active ? "deactivate" : "activate";
        if (!confirm(`${action === "deactivate" ? "Deactivate" : "Activate"} skill "${skill.name}"? ${action === "deactivate" ? "This will stop all routing to this skill immediately." : ""}`)) return;
        await fetch(`/api/admin/skills?id=${skill.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !skill.is_active }),
        });
        fetchSkills();
    }

    async function handleDeleteSkill(skill: Skill) {
        if (!confirm(`Deactivate and remove skill "${skill.name}"?`)) return;
        await fetch(`/api/admin/skills?id=${skill.id}`, { method: "DELETE" });
        if (selectedSkillId === skill.id) setSelectedSkillId(null);
        fetchSkills();
    }

    if (loading) return <div className={styles.tabLoading}>Loading skills...</div>;
    if (error) return <div className={styles.tabError}>Error loading skills: {error} <button className={styles.retryBtn} onClick={fetchSkills}>Retry</button></div>;

    return (
        <>
            <div className={styles.tabHeader}>
                <span className={styles.tabCount}>{skills.length} skill{skills.length !== 1 ? "s" : ""}</span>
                <div style={{ display: "flex", gap: 8 }}>
                    <button className={styles.generateBtn} onClick={() => setShowAiOnboard(true)} style={{ background: "#6366f1" }}>AI Onboard</button>
                    <button className={styles.generateBtn} onClick={() => setShowCreateSkill(true)}>+ Add Skill</button>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Providers</th>
                                <th>Calls</th>
                                <th>Active</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {skills.length === 0
                                ? <tr className={styles.emptyRow}><td colSpan={6}>No skills yet. Add one to start routing.</td></tr>
                                : skills.map(s => (
                                    <Fragment key={s.id}>
                                        <tr className={selectedSkillId === s.id ? styles.rowSelected : ""}>
                                            <td style={{ fontWeight: 500 }}>{s.name}</td>
                                            <td style={{ color: "#64748b", maxWidth: 280 }}>
                                                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {s.description}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: "center" }}>{Number(s.provider_count)}</td>
                                            <td style={{ textAlign: "center" }}>{Number(s.call_count)}</td>
                                            <td>
                                                <button
                                                    className={s.is_active ? styles.toggleOn : styles.toggleOff}
                                                    onClick={() => handleToggleActive(s)}
                                                >
                                                    {s.is_active ? "Active" : "Inactive"}
                                                </button>
                                            </td>
                                            <td>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <button
                                                        className={styles.actionBtn}
                                                        onClick={() => setSelectedSkillId(selectedSkillId === s.id ? null : s.id)}
                                                    >
                                                        {selectedSkillId === s.id ? "Hide Providers" : "Show Providers"}
                                                    </button>
                                                    <button className={styles.actionBtn} onClick={() => setEditingSkill(s)}>Edit</button>
                                                    <button className={styles.deleteBtn} onClick={() => handleDeleteSkill(s)}>Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                        {selectedSkillId === s.id && (
                                            <tr className={styles.providersInlineRow}>
                                                <td colSpan={6}>
                                                    <ProvidersPanel skill={s} onChanged={fetchSkills} />
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            {showCreateSkill && (
                <SkillModal
                    onClose={() => setShowCreateSkill(false)}
                    onSaved={() => { setShowCreateSkill(false); fetchSkills(); }}
                />
            )}
            {editingSkill && (
                <SkillModal
                    skill={editingSkill}
                    onClose={() => setEditingSkill(null)}
                    onSaved={() => { setEditingSkill(null); fetchSkills(); }}
                />
            )}
            {showAiOnboard && (
                <AiOnboardModal
                    onClose={() => setShowAiOnboard(false)}
                    onPublished={() => { setShowAiOnboard(false); fetchSkills(); }}
                />
            )}
        </>
    );
}

// ── Skill Create / Edit Modal ─────────────────────────────────────────────────

function SkillModal({ skill, onClose, onSaved }: { skill?: Skill; onClose: () => void; onSaved: () => void }) {
    const [name, setName] = useState(skill?.name ?? "");
    const [description, setDescription] = useState(skill?.description ?? "");
    const [tags, setTags] = useState(skill?.tags ? (JSON.parse(skill.tags) as string[]).join(", ") : "");
    const [paramsSchema, setParamsSchema] = useState(skill?.params_schema ?? "");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        if (!name.trim() || !description.trim()) { setError("Name and description are required."); return; }

        let parsedSchema: unknown = null;
        if (paramsSchema.trim()) {
            try { parsedSchema = JSON.parse(paramsSchema); } catch { setError("Params schema must be valid JSON."); return; }
        }

        const tagsArr = tags.split(",").map(t => t.trim()).filter(Boolean);

        setSubmitting(true);
        const url = skill ? `/api/admin/skills?id=${skill.id}` : "/api/admin/skills";
        const method = skill ? "PATCH" : "POST";
        const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description, paramsSchema: parsedSchema, tags: tagsArr.length ? tagsArr : null }),
        });
        setSubmitting(false);

        if (!res.ok) {
            const data = await res.json();
            setError(data.error ?? "Failed to save skill.");
            return;
        }
        onSaved();
    }

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} style={{ width: 520 }} onClick={e => e.stopPropagation()}>
                <h2>{skill ? "Edit Skill" : "Add Skill"}</h2>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label>Name</label>
                        <input className={styles.formInput} type="text" placeholder="e.g. Web Search" value={name} onChange={e => setName(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Description</label>
                        <textarea className={styles.formInput} rows={3} placeholder="What does this skill do?" value={description} onChange={e => setDescription(e.target.value)} required style={{ resize: "vertical" }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Tags <span className={styles.hint}>(comma-separated, optional)</span></label>
                        <input className={styles.formInput} type="text" placeholder="e.g. search, web, research" value={tags} onChange={e => setTags(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Params Schema <span className={styles.hint}>(JSON, optional)</span></label>
                        <textarea
                            className={styles.formInput}
                            rows={4}
                            placeholder={'{"query": "string", "depth": "string"}'}
                            value={paramsSchema}
                            onChange={e => setParamsSchema(e.target.value)}
                            style={{ resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
                        />
                    </div>
                    {error && <p className={styles.error}>{error}</p>}
                    {submitting && <p style={{ color: "#64748b", fontSize: 13 }}>Generating embedding...</p>}
                    <div className={styles.modalFooter}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                        <button type="submit" className={styles.submitBtn} disabled={submitting}>{submitting ? "Saving..." : skill ? "Save Changes" : "Create Skill"}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── AI Onboard Modal ─────────────────────────────────────────────────────────

interface AiDraft {
    skill?: { name?: string; description?: string; category?: string; tags?: string[]; paramsSchema?: Record<string, unknown> };
    providers?: Array<{ name?: string; endpoint?: string; pricePerCall?: number }>;
}

function AiOnboardModal({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
    const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
    const [input, setInput] = useState("");
    const [url, setUrl] = useState("");
    const [draft, setDraft] = useState<AiDraft | null>(null);
    const [thinking, setThinking] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState("");
    const [step, setStep] = useState<"chat" | "preview">("chat");

    // Editable preview fields
    const [editName, setEditName] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [editCategory, setEditCategory] = useState("");
    const [editTags, setEditTags] = useState("");
    const [editEndpoint, setEditEndpoint] = useState("");
    const [editPrice, setEditPrice] = useState("0.01");
    const [editProviderName, setEditProviderName] = useState("");

    const send = async () => {
        if (!input.trim()) return;
        const userMsg = { role: "user" as const, content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setThinking(true);
        setError("");

        try {
            const res = await fetch("/api/publisher/assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: input, url: url || undefined }),
            });
            const d = await res.json();
            setThinking(false);

            if (d.success) {
                const cleanReply = d.reply.replace(/```json[\s\S]*?```/g, "[Draft generated — see preview below]");
                setMessages(prev => [...prev, { role: "assistant", content: cleanReply }]);
                if (d.draft) {
                    setDraft(d.draft);
                    // Pre-fill editable fields
                    setEditName(d.draft.skill?.name ?? "");
                    setEditDesc(d.draft.skill?.description ?? "");
                    setEditCategory(d.draft.skill?.category ?? "");
                    setEditTags((d.draft.skill?.tags ?? []).join(", "));
                    const prov = d.draft.providers?.[0];
                    setEditEndpoint(prov?.endpoint ?? "");
                    setEditPrice(String(prov?.pricePerCall ?? 0.01));
                    setEditProviderName(prov?.name ?? "");
                }
            } else {
                setMessages(prev => [...prev, { role: "assistant", content: `Error: ${d.message}` }]);
            }
        } catch (e) {
            setThinking(false);
            setError(`Request failed: ${(e as Error).message}`);
        }
    };

    const publish = async () => {
        if (!editName.trim() || !editDesc.trim()) {
            setError("Name and description are required.");
            return;
        }
        if (!editEndpoint.trim()) {
            setError("Provider endpoint is required.");
            return;
        }
        setPublishing(true);
        setError("");

        try {
            const res = await fetch("/api/admin/skills", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: editName.trim(),
                    description: editDesc.trim(),
                    tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
                    paramsSchema: draft?.skill?.paramsSchema ?? null,
                    providers: [{
                        name: editProviderName.trim() || editName.trim(),
                        endpoint: editEndpoint.trim(),
                        pricePerCall: parseFloat(editPrice) || 0.01,
                    }],
                }),
            });
            const d = await res.json();
            setPublishing(false);

            if (d.success) {
                onPublished();
            } else {
                setError(d.error ?? "Failed to publish.");
            }
        } catch (e) {
            setPublishing(false);
            setError(`Publish failed: ${(e as Error).message}`);
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} style={{ width: 800, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h2 style={{ margin: 0 }}>AI Skill Onboard</h2>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={() => setStep("chat")}
                            style={{ padding: "4px 12px", borderRadius: 4, border: step === "chat" ? "1px solid #6366f1" : "1px solid #334155", background: step === "chat" ? "#6366f1" : "transparent", color: "#e2e8f0", cursor: "pointer", fontSize: 12 }}
                        >Chat</button>
                        <button
                            onClick={() => setStep("preview")}
                            disabled={!draft}
                            style={{ padding: "4px 12px", borderRadius: 4, border: step === "preview" ? "1px solid #10b981" : "1px solid #334155", background: step === "preview" ? "#10b981" : "transparent", color: draft ? "#e2e8f0" : "#475569", cursor: draft ? "pointer" : "not-allowed", fontSize: 12 }}
                        >Preview & Publish</button>
                    </div>
                </div>

                {step === "chat" && (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                        {/* URL input */}
                        <div style={{ marginBottom: 8 }}>
                            <input
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                placeholder="Documentation URL (optional) — e.g. https://docs.api.com/v1"
                                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }}
                            />
                        </div>

                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: "auto", marginBottom: 8, minHeight: 200, maxHeight: 350 }}>
                            {messages.length === 0 && (
                                <div style={{ color: "#475569", fontSize: 13, padding: "16px 0" }}>
                                    Describe the API you want to onboard. Example: "I want to add a PDF summarizer at https://api.example.com/summarize — it takes a URL param and returns a summary text."
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
                                    <div style={{ marginTop: 4 }}>{m.content}</div>
                                </div>
                            ))}
                            {thinking && <div style={{ color: "#6366f1", fontSize: 12, padding: 8 }}>Generating draft...</div>}
                        </div>

                        {/* Input */}
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                                placeholder="Describe the API..."
                                style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 13 }}
                                disabled={thinking}
                            />
                            <button onClick={send} disabled={thinking || !input.trim()} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                                Send
                            </button>
                        </div>

                        {draft && (
                            <div style={{ marginTop: 8, padding: "8px 12px", background: "#052e16", border: "1px solid #10b981", borderRadius: 6, fontSize: 12, color: "#a7f3d0" }}>
                                Draft ready: <strong>{draft.skill?.name}</strong> — <button onClick={() => setStep("preview")} style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer", textDecoration: "underline", fontSize: 12 }}>Review & Publish →</button>
                            </div>
                        )}
                    </div>
                )}

                {step === "preview" && draft && (
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>Review and edit the generated skill. Click "Publish Now" to make it live immediately.</div>
                        <div style={{ display: "grid", gap: 12 }}>
                            <div className={styles.formGroup}>
                                <label style={{ fontSize: 12 }}>Skill Name</label>
                                <input className={styles.formInput} value={editName} onChange={e => setEditName(e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label style={{ fontSize: 12 }}>Description</label>
                                <textarea className={styles.formInput} rows={3} value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ resize: "vertical" }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div className={styles.formGroup}>
                                    <label style={{ fontSize: 12 }}>Category</label>
                                    <input className={styles.formInput} value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="e.g. search/web" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label style={{ fontSize: 12 }}>Tags (comma-separated)</label>
                                    <input className={styles.formInput} value={editTags} onChange={e => setEditTags(e.target.value)} />
                                </div>
                            </div>
                            <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12, marginTop: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>Provider</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12 }}>
                                    <div className={styles.formGroup}>
                                        <label style={{ fontSize: 11 }}>Provider Name</label>
                                        <input className={styles.formInput} value={editProviderName} onChange={e => setEditProviderName(e.target.value)} placeholder="Provider name" />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label style={{ fontSize: 11 }}>Endpoint URL</label>
                                        <input className={styles.formInput} value={editEndpoint} onChange={e => setEditEndpoint(e.target.value)} placeholder="https://..." />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label style={{ fontSize: 11 }}>Price/call ($)</label>
                                        <input className={styles.formInput} type="number" step="0.001" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
                                    </div>
                                </div>
                            </div>
                            {draft.skill?.paramsSchema && (
                                <div className={styles.formGroup}>
                                    <label style={{ fontSize: 12 }}>Params Schema (inferred)</label>
                                    <pre style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: 8, fontSize: 11, color: "#94a3b8", overflow: "auto", maxHeight: 100 }}>
                                        {JSON.stringify(draft.skill.paramsSchema, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}

                <div className={styles.modalFooter}>
                    <button type="button" className={styles.cancelBtn} onClick={onClose}>Close</button>
                    {step === "preview" && (
                        <button
                            className={styles.submitBtn}
                            onClick={publish}
                            disabled={publishing}
                            style={{ background: "#10b981" }}
                        >
                            {publishing ? "Publishing..." : "Publish Now"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Providers Panel ───────────────────────────────────────────────────────────

function ProvidersPanel({ skill, onChanged }: { skill: Skill; onChanged?: () => void }) {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);

    const fetchProviders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/providers?skillId=${skill.id}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setProviders(data.providers ?? []);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [skill.id]);

    useEffect(() => { fetchProviders(); }, [fetchProviders]);

    async function handleToggle(p: Provider) {
        if (!confirm(`${p.isActive ? "Deactivate" : "Activate"} provider "${p.name}"? ${p.isActive ? "Routing will stop using this provider immediately." : ""}`)) return;
        await fetch(`/api/admin/providers?id=${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !p.isActive }),
        });
        fetchProviders();
        onChanged?.();
    }

    async function handleDelete(p: Provider) {
        if (!confirm(`Deactivate provider "${p.name}"?`)) return;
        await fetch(`/api/admin/providers?id=${p.id}`, { method: "DELETE" });
        fetchProviders();
        onChanged?.();
    }

    async function handleResetStats(p: Provider) {
        if (!confirm(`Reset routing stats for provider "${p.name}"? This resets latency, retry, and timeout rates; call history stays intact.`)) return;
        await fetch(`/api/admin/providers?id=${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resetStats: true }),
        });
        fetchProviders();
    }

    return (
        <div className={styles.providersPanel}>
            <div className={styles.providersPanelHeader}>
                <p className={styles.sectionTitle}>Providers for {skill.name}</p>
                <button className={styles.generateBtn} style={{ fontSize: 13, padding: "7px 14px" }} onClick={() => setShowAdd(true)}>+ Add Provider</button>
            </div>

            {loading && <div className={styles.tabLoading} style={{ padding: "20px 0" }}>Loading providers...</div>}
            {error && <div className={styles.tabError}>Error: {error} <button className={styles.retryBtn} onClick={fetchProviders}>Retry</button></div>}

            {!loading && !error && (
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Endpoint</th>
                                <th>Price/call</th>
                                <th>Avg latency</th>
                                <th>Retry rate</th>
                                <th>Timeout rate</th>
                                <th>Active</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {providers.length === 0
                                ? <tr className={styles.emptyRow}><td colSpan={8}>No providers yet.</td></tr>
                                : providers.map(p => (
                                    <tr key={p.id}>
                                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                                        <td><span className={styles.endpointCell}>{p.endpoint}</span></td>
                                        <td>${Number(p.pricePerCall).toFixed(4)}</td>
                                        <td>{Number(p.avgLatencyMs)}ms</td>
                                        <td>{(Number(p.retryRate) * 100).toFixed(1)}%</td>
                                        <td>{(Number(p.timeoutRate) * 100).toFixed(1)}%</td>
                                        <td>
                                            <button className={p.isActive ? styles.toggleOn : styles.toggleOff} onClick={() => handleToggle(p)}>
                                                {p.isActive ? "Active" : "Inactive"}
                                            </button>
                                        </td>
                                        <td>
                                            <div style={{ display: "flex", gap: 8 }}>
                                                <button className={styles.actionBtn} onClick={() => handleResetStats(p)}>Reset stats</button>
                                                <button className={styles.deleteBtn} onClick={() => handleDelete(p)}>Remove</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
            )}

            {showAdd && (
                <ProviderModal
                    skillId={skill.id}
                    onClose={() => setShowAdd(false)}
                    onSaved={() => { setShowAdd(false); fetchProviders(); onChanged?.(); }}
                />
            )}
        </div>
    );
}

// ── Provider Add Modal ────────────────────────────────────────────────────────

function ProviderModal({ skillId, onClose, onSaved }: { skillId: number; onClose: () => void; onSaved: () => void }) {
    const [name, setName] = useState("");
    const [endpoint, setEndpoint] = useState("");
    const [pricePerCall, setPricePerCall] = useState("");
    const [providerSecret, setProviderSecret] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        const price = parseFloat(pricePerCall);
        if (!name.trim() || !endpoint.trim() || isNaN(price)) { setError("All fields are required."); return; }

        setSubmitting(true);
        const res = await fetch("/api/admin/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ skillId, name, endpoint, pricePerCall: price, providerSecret: providerSecret.trim() || null }),
        });
        setSubmitting(false);

        if (!res.ok) {
            const data = await res.json();
            setError(data.error ?? "Failed to add provider.");
            return;
        }
        onSaved();
    }

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2>Add Provider</h2>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label>Name</label>
                        <input className={styles.formInput} type="text" placeholder="e.g. Linkup Standard" value={name} onChange={e => setName(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Endpoint (HTTPS)</label>
                        <input className={styles.formInput} type="url" placeholder="https://app.aporto.tech/api/providers/search" value={endpoint} onChange={e => setEndpoint(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Price per call (USD)</label>
                        <input className={styles.formInput} type="number" min="0" step="0.0001" placeholder="0.006" value={pricePerCall} onChange={e => setPricePerCall(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Provider Secret (optional)</label>
                        <input className={styles.formInput} type="password" placeholder="Bearer token forwarded to provider endpoint" value={providerSecret} onChange={e => setProviderSecret(e.target.value)} />
                    </div>
                    {error && <p className={styles.error}>{error}</p>}
                    <div className={styles.modalFooter}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                        <button type="submit" className={styles.submitBtn} disabled={submitting}>{submitting ? "Adding..." : "Add Provider"}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

function successColor(rate: number): string {
    if (rate >= 0.9) return "#00dc82";
    if (rate >= 0.7) return "#f59e0b";
    return "#ef4444";
}

function StatsTab() {
    const [data, setData] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState(7);
    const [resettingProviderId, setResettingProviderId] = useState<number | null>(null);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/stats?period=${period}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const nextData = await res.json();
            setData(nextData);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    async function resetProviderStats(provider: StatsProvider) {
        if (!confirm(`Reset routing stats for provider "${provider.name}"? Historical calls stay in the stats tables.`)) return;
        setResettingProviderId(provider.id);
        try {
            const res = await fetch(`/api/admin/providers?id=${provider.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resetStats: true }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await fetchStats();
        } catch (e) {
            setError(String(e));
        } finally {
            setResettingProviderId(null);
        }
    }

    if (loading) return <div className={styles.tabLoading}>Loading stats...</div>;
    if (error || !data) return <div className={styles.tabError}>Error loading stats: {error} <button className={styles.retryBtn} onClick={fetchStats}>Retry</button></div>;

    const { overview, topSkills, providers, dailyVolume } = data;
    const maxCalls = Math.max(...dailyVolume.map((d) => d.calls), 1);

    return (
        <>
            <div className={styles.tabHeader}>
                <span className={styles.tabCount}>Last {period} day{period === 1 ? "" : "s"}</span>
                <div className={styles.periodControl}>
                    {[1, 7, 30].map((days) => (
                        <button
                            key={days}
                            className={`${styles.periodBtn} ${period === days ? styles.periodBtnActive : ""}`}
                            onClick={() => setPeriod(days)}
                        >
                            {days}d
                        </button>
                    ))}
                </div>
            </div>

            {/* Overview cards */}
            <div className={styles.statsGrid}>
                <div className={styles.statsCard}>
                    <div className={styles.statsCardLabel}>Total Calls</div>
                    <div className={styles.statsCardValue}>{overview.totalCalls.toLocaleString()}</div>
                </div>
                <div className={styles.statsCard}>
                    <div className={styles.statsCardLabel}>Success Rate</div>
                    <div className={styles.statsCardValue} style={{ color: successColor(overview.successRate) }}>
                        {(overview.successRate * 100).toFixed(1)}%
                    </div>
                </div>
                <div className={styles.statsCard}>
                    <div className={styles.statsCardLabel}>Avg Latency</div>
                    <div className={styles.statsCardValue}>{overview.avgLatencyMs}ms</div>
                </div>
                <div className={styles.statsCard}>
                    <div className={styles.statsCardLabel}>Retry Rate</div>
                    <div className={styles.statsCardValue} style={{ color: overview.retryRate > 0.1 ? "#f59e0b" : "#cbd5e1" }}>
                        {(overview.retryRate * 100).toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* Error breakdown */}
            <div className={styles.section}>
                <p className={styles.sectionTitle}>Error Breakdown</p>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead><tr><th>Type</th><th>Count</th></tr></thead>
                        <tbody>
                            <tr><td style={{ color: "#00dc82" }}>Success</td><td>{overview.errorBreakdown.success}</td></tr>
                            <tr><td style={{ color: "#f59e0b" }}>Timeout</td><td>{overview.errorBreakdown.timeout}</td></tr>
                            <tr><td style={{ color: "#ef4444" }}>5xx Error</td><td>{overview.errorBreakdown.error_5xx}</td></tr>
                            <tr><td style={{ color: "#ef4444" }}>4xx Error</td><td>{overview.errorBreakdown.error_4xx}</td></tr>
                            <tr><td style={{ color: "#94a3b8" }}>Network Error</td><td>{overview.errorBreakdown.network_error}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Daily volume bar chart */}
            {dailyVolume.length > 0 && (
                <div className={styles.section}>
                    <p className={styles.sectionTitle}>Daily Volume</p>
                    <div className={styles.barChart}>
                        {dailyVolume.map((d) => (
                            <div key={d.day} className={styles.barCol}>
                                <div className={styles.barWrap}>
                                    <div
                                        className={styles.barSuccess}
                                        style={{ height: `${(d.successCalls / maxCalls) * 100}%` }}
                                        title={`${d.successCalls} success`}
                                    />
                                    <div
                                        className={styles.barFail}
                                        style={{ height: `${((d.calls - d.successCalls) / maxCalls) * 100}%` }}
                                        title={`${d.calls - d.successCalls} failed`}
                                    />
                                </div>
                                <div className={styles.barLabel}>{d.day.slice(5)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Top skills */}
            {topSkills.length > 0 && (
                <div className={styles.section}>
                    <p className={styles.sectionTitle}>Top Skills</p>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>Skill</th><th>Calls</th><th>Success Rate</th><th>Avg Latency</th></tr>
                            </thead>
                            <tbody>
                                {topSkills.map((s) => (
                                    <tr key={s.id}>
                                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                                        <td>{s.calls}</td>
                                        <td style={{ color: successColor(s.successRate) }}>{(s.successRate * 100).toFixed(1)}%</td>
                                        <td>{s.avgLatencyMs}ms</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Provider stats */}
            {providers.length > 0 && (
                <div className={styles.section}>
                    <p className={styles.sectionTitle}>Providers</p>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Provider</th>
                                    <th>Skill</th>
                                    <th>Calls</th>
                                    <th>Success Rate</th>
                                    <th>Avg Latency</th>
                                    <th>Retry Rate</th>
                                    <th>Timeout Rate</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {providers.map((p) => (
                                    <tr key={p.id}>
                                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                                        <td style={{ color: "#64748b" }}>{p.skillName}</td>
                                        <td>{p.calls}</td>
                                        <td style={{ color: successColor(p.successRate) }}>{(p.successRate * 100).toFixed(1)}%</td>
                                        <td>{p.avgLatencyMs}ms</td>
                                        <td style={{ color: p.retryRate > 0.1 ? "#f59e0b" : "#cbd5e1" }}>{(p.retryRate * 100).toFixed(1)}%</td>
                                        <td style={{ color: p.timeoutRate > 0.05 ? "#ef4444" : "#cbd5e1" }}>{(p.timeoutRate * 100).toFixed(1)}%</td>
                                        <td>
                                            <button
                                                className={styles.actionBtn}
                                                disabled={resettingProviderId === p.id}
                                                onClick={() => resetProviderStats(p)}
                                            >
                                                {resettingProviderId === p.id ? "Resetting..." : "Reset stats"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </>
    );
}

// ── PendingReviewTab ──────────────────────────────────────────────────────────

interface PendingSubmission {
    id: number; name: string; description: string; category: string | null;
    status: string; review_note: string | null; ai_recommendation: string | null;
    created_at: string;
    publisher_id: string; publisher_name: string; publisher_email: string;
    publisher_revenue_share: number; provider_count: number;
}

interface AiRecommendation {
    action: "create_skill" | "add_provider" | "reject";
    reason: string;
    duplicateSkillId?: number;
    duplicateSkillName?: string;
    suggestedName?: string;
    issues?: string[];
}

function PendingReviewTab() {
    const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [rejectId, setRejectId] = useState<number | null>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [working, setWorking] = useState<number | null>(null);
    const [reviewResults, setReviewResults] = useState<Record<number, { recommendation: AiRecommendation; similarSkills: Array<{ id: number; name: string; similarity: number }> }>>({});

    const load = () => {
        setLoading(true);
        fetch("/api/admin/pending")
            .then(r => r.json())
            .then(d => { if (d.success) setSubmissions(d.submissions ?? []); })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const reviewWithAi = async (id: number) => {
        setWorking(id);
        try {
            const res = await fetch(`/api/admin/submissions/review?id=${id}`, { method: "POST" });
            const data = await res.json();
            if (data.success) {
                setReviewResults(prev => ({ ...prev, [id]: { recommendation: data.recommendation, similarSkills: data.similarSkills } }));
            } else {
                alert(data.error || "Review failed");
            }
        } finally { setWorking(null); load(); }
    };

    const execute = async (id: number, action: "approve" | "reject" | "merge", reason?: string, targetSkillId?: number) => {
        setWorking(id);
        try {
            const res = await fetch(`/api/admin/submissions/execute?id=${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, reason, targetSkillId }),
            });
            const data = await res.json();
            if (!data.success) alert(data.error || "Execute failed");
        } finally {
            setWorking(null);
            setRejectId(null);
            setRejectReason("");
            setReviewResults(prev => { const n = { ...prev }; delete n[id]; return n; });
            load();
        }
    };

    if (loading) return <div style={{ color: "#64748b", padding: "24px 0" }}>Loading...</div>;

    const actionColor = (a: string) => a === "create_skill" ? "#10b981" : a === "add_provider" ? "#6366f1" : "#ef4444";
    const actionLabel = (a: string) => a === "create_skill" ? "Create Skill" : a === "add_provider" ? "Add as Provider" : "Reject";

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Pending Submissions ({submissions.length})</h2>
                <button onClick={load} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#cbd5e1", cursor: "pointer" }}>Refresh</button>
            </div>
            {submissions.length === 0 && <div style={{ color: "#64748b" }}>No submissions pending review.</div>}
            {submissions.map(s => {
                const review = reviewResults[s.id] || (s.ai_recommendation ? { recommendation: JSON.parse(s.ai_recommendation) as AiRecommendation, similarSkills: [] } : null);
                return (
                    <div key={s.id} style={{ border: "1px solid #1e293b", borderRadius: 8, padding: 16, marginBottom: 16, background: "#0f172a" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 15 }}>
                                    {s.name} <span style={{ color: "#64748b", fontWeight: 400, fontSize: 13 }}>#{s.id}</span>
                                    {s.status === "reviewing" && <span style={{ marginLeft: 8, color: "#f59e0b", fontSize: 11, fontWeight: 500 }}>REVIEWING</span>}
                                </div>
                                <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{s.category ?? "uncategorized"} · {s.provider_count} provider(s)</div>
                                <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>by {s.publisher_name} ({s.publisher_email}) · {Math.round(s.publisher_revenue_share * 100)}% rev share</div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                {!review && (
                                    <button
                                        disabled={working === s.id}
                                        onClick={() => reviewWithAi(s.id)}
                                        style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 600 }}
                                    >{working === s.id ? "Reviewing..." : "Review with AI"}</button>
                                )}
                            </div>
                        </div>
                        <p style={{ color: "#94a3b8", fontSize: 13, margin: "12px 0 0" }}>{s.description}</p>

                        {/* AI Recommendation */}
                        {review && (
                            <div style={{ marginTop: 12, padding: 12, background: "#1e293b", borderRadius: 6, border: `1px solid ${actionColor(review.recommendation.action)}33` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                    <span style={{ color: actionColor(review.recommendation.action), fontWeight: 700, fontSize: 12 }}>
                                        AI: {actionLabel(review.recommendation.action).toUpperCase()}
                                    </span>
                                    {review.recommendation.duplicateSkillName && (
                                        <span style={{ color: "#94a3b8", fontSize: 12 }}>→ "{review.recommendation.duplicateSkillName}" (ID: {review.recommendation.duplicateSkillId})</span>
                                    )}
                                </div>
                                <div style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.5 }}>{review.recommendation.reason}</div>
                                {review.recommendation.issues && review.recommendation.issues.length > 0 && (
                                    <ul style={{ color: "#fbbf24", fontSize: 12, margin: "8px 0 0", paddingLeft: 16 }}>
                                        {review.recommendation.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                                    </ul>
                                )}

                                {/* Action buttons */}
                                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                                    {review.recommendation.action === "create_skill" && (
                                        <button disabled={working === s.id} onClick={() => execute(s.id, "approve", "AI approved: " + review.recommendation.reason)}
                                            style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
                                            {working === s.id ? "..." : "Create Skill"}
                                        </button>
                                    )}
                                    {review.recommendation.action === "add_provider" && (
                                        <button disabled={working === s.id} onClick={() => execute(s.id, "merge", "Merged: " + review.recommendation.reason, review.recommendation.duplicateSkillId)}
                                            style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
                                            {working === s.id ? "..." : "Merge as Provider"}
                                        </button>
                                    )}
                                    {review.recommendation.action === "reject" && (
                                        <button disabled={working === s.id} onClick={() => execute(s.id, "reject", review.recommendation.reason)}
                                            style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
                                            {working === s.id ? "..." : "Reject"}
                                        </button>
                                    )}
                                    {/* Override buttons */}
                                    {review.recommendation.action !== "create_skill" && (
                                        <button disabled={working === s.id} onClick={() => execute(s.id, "approve", "Admin override: approved")}
                                            style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #10b981", background: "transparent", color: "#10b981", cursor: "pointer", fontSize: 12 }}>
                                            Override: Approve
                                        </button>
                                    )}
                                    {review.recommendation.action !== "reject" && (
                                        <button disabled={working === s.id} onClick={() => setRejectId(s.id)}
                                            style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>
                                            Override: Reject
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Reject modal */}
                        {rejectId === s.id && (
                            <div style={{ marginTop: 12 }}>
                                <textarea
                                    value={rejectReason}
                                    onChange={e => setRejectReason(e.target.value)}
                                    placeholder="Rejection reason (min 10 chars)..."
                                    style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 13, resize: "vertical", minHeight: 80 }}
                                />
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <button onClick={() => execute(s.id, "reject", rejectReason)} disabled={working === s.id || rejectReason.trim().length < 10}
                                        style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer" }}>Send Rejection</button>
                                    <button onClick={() => { setRejectId(null); setRejectReason(""); }}
                                        style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>Cancel</button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── PublishersTab ─────────────────────────────────────────────────────────────

interface PublisherRow {
    publisher_id: string; display_name: string; email: string; website: string | null;
    status: string; revenue_share: number; approved_at: string | null;
    skill_count: number; live_skill_count: number; total_calls: number; unpaid_usd: number;
}

function PublishersTab() {
    const [publishers, setPublishers] = useState<PublisherRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);

    const load = () => {
        setLoading(true);
        fetch("/api/admin/publishers")
            .then(r => r.json())
            .then(d => { if (d.success) setPublishers(d.publishers ?? []); })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const action = async (id: string, act: "approve" | "suspend") => {
        setWorking(true);
        await fetch(`/api/admin/publishers/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: act }),
        });
        setWorking(false);
        load();
    };

    const markPaid = async (publisherId: string) => {
        setWorking(true);
        await fetch("/api/admin/publisher-payouts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publisherId }),
        });
        setWorking(false);
        load();
    };

    if (loading) return <div style={{ color: "#64748b", padding: "24px 0" }}>Loading...</div>;

    const statusColor = (s: string) => s === "approved" ? "#10b981" : s === "pending" ? "#f59e0b" : "#ef4444";

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Publishers ({publishers.length})</h2>
                <button onClick={load} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#cbd5e1", cursor: "pointer" }}>Refresh</button>
            </div>
            {publishers.length === 0 && <div style={{ color: "#64748b" }}>No publishers yet.</div>}
            {publishers.map(p => (
                <div key={p.publisher_id} style={{ border: "1px solid #1e293b", borderRadius: 8, padding: 16, marginBottom: 12, background: "#0f172a" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{p.display_name}</div>
                            <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{p.email} {p.website && <span>· <a href={p.website} target="_blank" rel="noreferrer" style={{ color: "#6366f1" }}>{p.website}</a></span>}</div>
                            <div style={{ marginTop: 6, display: "flex", gap: 16 }}>
                                <span style={{ color: statusColor(p.status), fontWeight: 600, fontSize: 12 }}>{p.status.toUpperCase()}</span>
                                <span style={{ color: "#94a3b8", fontSize: 12 }}>{Math.round(p.revenue_share * 100)}% rev share</span>
                                <span style={{ color: "#94a3b8", fontSize: 12 }}>{p.live_skill_count}/{p.skill_count} skills live</span>
                                <span style={{ color: "#94a3b8", fontSize: 12 }}>{p.total_calls} calls</span>
                                {p.unpaid_usd > 0 && <span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 600 }}>${p.unpaid_usd.toFixed(4)} unpaid</span>}
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {p.status === "pending" && (
                                <button disabled={working} onClick={() => action(p.publisher_id, "approve")}
                                    style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontSize: 12 }}>
                                    Approve
                                </button>
                            )}
                            {p.status === "approved" && (
                                <button disabled={working} onClick={() => action(p.publisher_id, "suspend")}
                                    style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>
                                    Suspend
                                </button>
                            )}
                            {p.status === "suspended" && (
                                <button disabled={working} onClick={() => action(p.publisher_id, "approve")}
                                    style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #10b981", background: "transparent", color: "#10b981", cursor: "pointer", fontSize: 12 }}>
                                    Re-approve
                                </button>
                            )}
                            {p.unpaid_usd > 0 && (
                                <button disabled={working} onClick={() => markPaid(p.publisher_id)}
                                    style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 12 }}>
                                    Mark Paid (${p.unpaid_usd.toFixed(2)})
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
