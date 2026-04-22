"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";

const ADMIN_EMAIL = "pevzner@aporto.tech";

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
    isActive: boolean;
    createdAt: string;
}
interface WaitlistEntry {
    id: number;
    email: string;
    name: string | null;
    useCase: string | null;
    createdAt: string;
    approved: boolean;
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

type Tab = "promo" | "skills" | "waitlist" | "stats";

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>("promo");

    useEffect(() => {
        if (status === "loading") return;
        if (!session || (session.user as any)?.email !== ADMIN_EMAIL) {
            router.push("/dashboard");
        }
    }, [session, status, router]);

    if (status === "loading") {
        return <div className={styles.container} style={{ color: "#64748b" }}>Loading...</div>;
    }
    if (!session || (session.user as any)?.email !== ADMIN_EMAIL) {
        return null;
    }

    return (
        <div className={styles.container} style={{ minWidth: 1024 }}>
            <div className={styles.header}>
                <h1>Admin</h1>
            </div>

            {/* Tab bar */}
            <div className={styles.tabBar}>
                {(["promo", "skills", "waitlist", "stats"] as Tab[]).map((t) => (
                    <button
                        key={t}
                        className={`${styles.tabBtn} ${activeTab === t ? styles.tabBtnActive : ""}`}
                        onClick={() => setActiveTab(t)}
                    >
                        {t === "promo" ? "Promo Codes" : t === "skills" ? "Skills & Providers" : t === "waitlist" ? "Publisher Waitlist" : "Stats"}
                    </button>
                ))}
            </div>

            {activeTab === "promo" && <PromoTab />}
            {activeTab === "skills" && <SkillsTab />}
            {activeTab === "waitlist" && <WaitlistTab />}
            {activeTab === "stats" && <StatsTab />}
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

    const selectedSkill = skills.find(s => s.id === selectedSkillId) ?? null;

    if (loading) return <div className={styles.tabLoading}>Loading skills...</div>;
    if (error) return <div className={styles.tabError}>Error loading skills: {error} <button className={styles.retryBtn} onClick={fetchSkills}>Retry</button></div>;

    return (
        <>
            <div className={styles.tabHeader}>
                <span className={styles.tabCount}>{skills.length} skill{skills.length !== 1 ? "s" : ""}</span>
                <button className={styles.generateBtn} onClick={() => setShowCreateSkill(true)}>+ Add Skill</button>
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
                                    <tr key={s.id} className={selectedSkillId === s.id ? styles.rowSelected : ""}>
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
                                                    {selectedSkillId === s.id ? "Hide Providers" : "Manage Providers →"}
                                                </button>
                                                <button className={styles.actionBtn} onClick={() => setEditingSkill(s)}>Edit</button>
                                                <button className={styles.deleteBtn} onClick={() => handleDeleteSkill(s)}>Delete</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedSkill && (
                <div className={styles.section}>
                    <ProvidersPanel skill={selectedSkill} />
                </div>
            )}

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

// ── Providers Panel ───────────────────────────────────────────────────────────

function ProvidersPanel({ skill }: { skill: Skill }) {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);

    useEffect(() => { fetchProviders(); }, [skill.id]);

    async function fetchProviders() {
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
    }

    async function handleToggle(p: Provider) {
        if (!confirm(`${p.isActive ? "Deactivate" : "Activate"} provider "${p.name}"? ${p.isActive ? "Routing will stop using this provider immediately." : ""}`)) return;
        await fetch(`/api/admin/providers?id=${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !p.isActive }),
        });
        fetchProviders();
    }

    async function handleDelete(p: Provider) {
        if (!confirm(`Deactivate provider "${p.name}"?`)) return;
        await fetch(`/api/admin/providers?id=${p.id}`, { method: "DELETE" });
        fetchProviders();
    }

    return (
        <div className={styles.providersPanel}>
            <div className={styles.providersPanelHeader}>
                <p className={styles.sectionTitle}>Providers for "{skill.name}"</p>
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
                                <th>Active</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {providers.length === 0
                                ? <tr className={styles.emptyRow}><td colSpan={7}>No providers yet.</td></tr>
                                : providers.map(p => (
                                    <tr key={p.id}>
                                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                                        <td><span className={styles.endpointCell}>{p.endpoint}</span></td>
                                        <td>${Number(p.pricePerCall).toFixed(4)}</td>
                                        <td>{Number(p.avgLatencyMs)}ms</td>
                                        <td>{(Number(p.retryRate) * 100).toFixed(1)}%</td>
                                        <td>
                                            <button className={p.isActive ? styles.toggleOn : styles.toggleOff} onClick={() => handleToggle(p)}>
                                                {p.isActive ? "Active" : "Inactive"}
                                            </button>
                                        </td>
                                        <td>
                                            <button className={styles.deleteBtn} onClick={() => handleDelete(p)}>Remove</button>
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
                    onSaved={() => { setShowAdd(false); fetchProviders(); }}
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
            body: JSON.stringify({ skillId, name, endpoint, pricePerCall: price }),
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

// ── Publisher Waitlist Tab ────────────────────────────────────────────────────

function WaitlistTab() {
    const [entries, setEntries] = useState<WaitlistEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [approvedIds, setApprovedIds] = useState<Set<number>>(new Set());

    useEffect(() => { fetchEntries(); }, []);

    async function fetchEntries() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/waitlist");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setEntries(data.entries ?? []);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }

    async function handleApprove(entry: WaitlistEntry) {
        await fetch(`/api/admin/waitlist?id=${entry.id}`, { method: "PATCH" });
        setApprovedIds(prev => new Set([...prev, entry.id]));
    }

    if (loading) return <div className={styles.tabLoading}>Loading waitlist...</div>;
    if (error) return <div className={styles.tabError}>Error loading waitlist: {error} <button className={styles.retryBtn} onClick={fetchEntries}>Retry</button></div>;

    const pending = entries.filter(e => !e.approved);
    const approved = entries.filter(e => e.approved);

    return (
        <>
            <div className={styles.tabHeader}>
                <span className={styles.tabCount}>{pending.length} pending, {approved.length} approved</span>
            </div>

            <div className={styles.section}>
                <p className={styles.sectionTitle}>Pending</p>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr><th>Email</th><th>Name</th><th>Use Case</th><th>Signed Up</th><th></th></tr>
                        </thead>
                        <tbody>
                            {pending.length === 0
                                ? <tr className={styles.emptyRow}><td colSpan={5}>No pending entries.</td></tr>
                                : pending.map(e => (
                                    <tr key={e.id}>
                                        <td>{e.email}</td>
                                        <td>{e.name ?? "—"}</td>
                                        <td style={{ maxWidth: 260, color: "#94a3b8" }}>
                                            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {e.useCase ?? "—"}
                                            </span>
                                        </td>
                                        <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            {approvedIds.has(e.id)
                                                ? <span style={{ color: "#6be195", fontSize: 13 }}>Approved — will be contacted manually</span>
                                                : <button className={styles.approveBtn} onClick={() => handleApprove(e)}>Approve</button>
                                            }
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            {approved.length > 0 && (
                <div className={styles.section}>
                    <p className={styles.sectionTitle}>Approved</p>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>Email</th><th>Name</th><th>Use Case</th><th>Signed Up</th></tr>
                            </thead>
                            <tbody>
                                {approved.map(e => (
                                    <tr key={e.id}>
                                        <td>{e.email}</td>
                                        <td>{e.name ?? "—"}</td>
                                        <td style={{ color: "#94a3b8" }}>{e.useCase ?? "—"}</td>
                                        <td>{new Date(e.createdAt).toLocaleDateString()}</td>
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

    useEffect(() => {
        setLoading(true);
        setError(null);
        fetch("/api/admin/stats?period=7")
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then((d) => { setData(d); setLoading(false); })
            .catch((e) => { setError(String(e)); setLoading(false); });
    }, []);

    if (loading) return <div className={styles.tabLoading}>Loading stats...</div>;
    if (error || !data) return <div className={styles.tabError}>Error loading stats: {error} <button className={styles.retryBtn} onClick={() => window.location.reload()}>Retry</button></div>;

    const { overview, topSkills, providers, dailyVolume } = data;
    const maxCalls = Math.max(...dailyVolume.map((d) => d.calls), 1);

    return (
        <>
            <div className={styles.tabHeader}>
                <span className={styles.tabCount}>Last 7 days</span>
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
