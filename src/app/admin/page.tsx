"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";

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

const ADMIN_EMAIL = "pevzner@aporto.tech";

export default function AdminPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [codes, setCodes] = useState<PromoCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    // Form state
    const [formCode, setFormCode] = useState("");
    const [formCredit, setFormCredit] = useState("60");
    const [formMaxUses, setFormMaxUses] = useState("1");
    const [formExpires, setFormExpires] = useState("");
    const [formError, setFormError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (status === "loading") return;
        if (!session || (session.user as any)?.email !== ADMIN_EMAIL) {
            router.push("/dashboard");
        }
    }, [session, status, router]);

    useEffect(() => {
        if (session && (session.user as any)?.email === ADMIN_EMAIL) {
            fetchCodes();
        }
    }, [session]);

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
        if (!credit || credit <= 0) {
            setFormError("Credit must be greater than 0.");
            return;
        }
        setSubmitting(true);
        const res = await fetch("/api/admin/promo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code: formCode.trim() || undefined,
                creditUSD: credit,
                maxUses: parseInt(formMaxUses) || 1,
                expiresAt: formExpires || undefined,
            }),
        });
        const data = await res.json();
        setSubmitting(false);
        if (!res.ok) {
            setFormError(data.error ?? "Failed to create code.");
            return;
        }
        setShowModal(false);
        setFormCode("");
        setFormCredit("60");
        setFormMaxUses("1");
        setFormExpires("");
        fetchCodes();
    }

    // All redemptions flattened, sorted by date desc
    const allRedemptions = codes
        .flatMap(c => c.redemptions.map(r => ({ ...r, code: c.code, creditUSD: c.creditUSD })))
        .sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime())
        .slice(0, 20);

    if (status === "loading" || loading) {
        return <div className={styles.container} style={{ color: "#64748b" }}>Loading...</div>;
    }

    if (!session || (session.user as any)?.email !== ADMIN_EMAIL) {
        return null;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Promo Codes</h1>
                <button className={styles.generateBtn} onClick={() => setShowModal(true)}>
                    + Generate Code
                </button>
            </div>

            {/* Codes table */}
            <div className={styles.section}>
                <p className={styles.sectionTitle}>Active Codes</p>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Credit</th>
                                <th>Uses</th>
                                <th>Expires</th>
                                <th>Created</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {codes.length === 0 ? (
                                <tr className={styles.emptyRow}>
                                    <td colSpan={6}>No promo codes yet.</td>
                                </tr>
                            ) : (
                                codes.map(c => (
                                    <tr key={c.id}>
                                        <td>
                                            <span className={styles.codeBadge}>{c.code}</span>
                                        </td>
                                        <td>${c.creditUSD.toFixed(2)}</td>
                                        <td>
                                            {c.usedCount}/{c.maxUses}
                                        </td>
                                        <td>
                                            {c.expiresAt
                                                ? new Date(c.expiresAt).toLocaleDateString()
                                                : "—"}
                                        </td>
                                        <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            <button
                                                className={styles.deleteBtn}
                                                onClick={() => handleDelete(c.id, c.code)}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Recent redemptions */}
            <div className={styles.section}>
                <p className={styles.sectionTitle}>Recent Redemptions</p>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Code</th>
                                <th>Credit</th>
                                <th>Redeemed At</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allRedemptions.length === 0 ? (
                                <tr className={styles.emptyRow}>
                                    <td colSpan={4}>No redemptions yet.</td>
                                </tr>
                            ) : (
                                allRedemptions.map((r, i) => (
                                    <tr key={i}>
                                        <td>{r.email ?? r.userId}</td>
                                        <td>
                                            <span className={styles.codeBadge}>{r.code}</span>
                                        </td>
                                        <td>${r.creditUSD.toFixed(2)}</td>
                                        <td>
                                            {new Date(r.redeemedAt).toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Generate modal */}
            {showModal && (
                <div className={styles.overlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2>Generate Promo Code</h2>
                        <form onSubmit={handleGenerate}>
                            <div className={styles.formGroup}>
                                <label>Code <span className={styles.hint}>(leave blank to auto-generate)</span></label>
                                <input
                                    className={styles.formInput}
                                    type="text"
                                    placeholder="e.g. BETA-A7K3M2"
                                    value={formCode}
                                    onChange={e => setFormCode(e.target.value.toUpperCase())}
                                    style={{ textTransform: "uppercase" }}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Credit (USD)</label>
                                <input
                                    className={styles.formInput}
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    placeholder="60"
                                    value={formCredit}
                                    onChange={e => setFormCredit(e.target.value)}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Max Uses</label>
                                <input
                                    className={styles.formInput}
                                    type="number"
                                    min="1"
                                    placeholder="1"
                                    value={formMaxUses}
                                    onChange={e => setFormMaxUses(e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Expires <span className={styles.hint}>(optional)</span></label>
                                <input
                                    className={styles.formInput}
                                    type="date"
                                    value={formExpires}
                                    onChange={e => setFormExpires(e.target.value)}
                                    style={{ colorScheme: "dark" }}
                                />
                            </div>
                            {formError && <p className={styles.error}>{formError}</p>}
                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    className={styles.cancelBtn}
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={styles.submitBtn}
                                    disabled={submitting}
                                >
                                    {submitting ? "Creating..." : "Create Code"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
