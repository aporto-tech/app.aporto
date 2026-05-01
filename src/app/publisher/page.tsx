"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../dashboard.module.css";

interface PublisherAccount {
    publisherId: string; displayName: string; status: string;
    revenueSharePercent: string; approvedAt: string | null;
}
interface Earnings { totalUnpaidUSD: number }
interface Submissions { used: number; remaining: number; limit: number }

export default function PublisherPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [account, setAccount] = useState<PublisherAccount | null>(null);
    const [earnings, setEarnings] = useState<Earnings | null>(null);
    const [submissions, setSubmissions] = useState<Submissions | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasPublisher, setHasPublisher] = useState(false);

    useEffect(() => {
        if (status === "loading") return;
        if (!session) { router.push("/login"); return; }

        fetch("/api/publisher/status")
            .then(r => r.json())
            .then(d => {
                if (d.status && d.status !== "none") {
                    setHasPublisher(true);
                    fetch("/api/publisher/account")
                        .then(r => r.json())
                        .then(acc => {
                            if (acc.success) {
                                setAccount(acc.account);
                                setEarnings(acc.earnings);
                                setSubmissions(acc.submissions);
                            }
                        })
                        .finally(() => setLoading(false));
                } else {
                    setHasPublisher(false);
                    setLoading(false);
                }
            })
            .catch(() => setLoading(false));
    }, [session, status, router]);

    if (status === "loading" || loading) {
        return <div style={{ color: "#666" }}>Loading...</div>;
    }

    if (!hasPublisher) {
        return <GetStarted />;
    }

    return (
        <div>
            {/* Welcome card */}
            <div className={styles.welcomeCard}>
                <div className={styles.welcomeText}>
                    <h1>Welcome, {account?.displayName ?? session?.user?.name}</h1>
                    <p>Revenue share: {account?.revenueSharePercent ?? "85%"} per call. Publish skills and earn when agents use them.</p>
                </div>
                <div className={styles.welcomeProgress}>
                    <div className={styles.progressValue}>${(earnings?.totalUnpaidUSD ?? 0).toFixed(2)}</div>
                    <span className={styles.progressLabel}>Unpaid earnings</span>
                </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, margin: "24px 0" }}>
                <StatCard label="Pending Submissions" value={`${submissions?.used ?? 0} / ${submissions?.limit ?? 10}`} />
                <StatCard label="Slots Remaining" value={`${submissions?.remaining ?? 10}`} />
                <StatCard label="Revenue Share" value={account?.revenueSharePercent ?? "85%"} />
            </div>

            {/* Quick actions */}
            <div className={styles.quickActionsHeader}>Quick Actions</div>
            <div className={styles.actionGrid}>
                <Link href="/publisher/skills/new" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className={styles.actionCard}>
                        <div className={styles.actionIcon}>+</div>
                        <div className={styles.actionInfo}>
                            <h3>Add Skill</h3>
                            <p>Publish a new API as a skill</p>
                        </div>
                    </div>
                </Link>
                <Link href="/publisher/skills" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className={styles.actionCard}>
                        <div className={styles.actionIcon}>⚡</div>
                        <div className={styles.actionInfo}>
                            <h3>View Skills</h3>
                            <p>Manage your published skills</p>
                        </div>
                    </div>
                </Link>
                <Link href="/publisher/earnings" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className={styles.actionCard}>
                        <div className={styles.actionIcon}>$</div>
                        <div className={styles.actionInfo}>
                            <h3>Earnings</h3>
                            <p>Track revenue and payouts</p>
                        </div>
                    </div>
                </Link>
                <Link href="/publisher/keys" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className={styles.actionCard}>
                        <div className={styles.actionIcon}>🔑</div>
                        <div className={styles.actionInfo}>
                            <h3>API Keys</h3>
                            <p>Manage programmatic access</p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}

function GetStarted() {
    return (
        <div>
            {/* Welcome banner */}
            <div className={styles.servicesHub}>
                <div className={styles.hubContent}>
                    <h2>Publish Your API <span className={styles.hubBadge}>85% rev share</span></h2>
                    <p>Turn your API into a skill that AI agents discover and call. Earn per request.</p>
                </div>
            </div>

            {/* Checklist */}
            <div className={styles.checklistCard} style={{ marginTop: 24 }}>
                <div className={styles.checklistHeader}>
                    <h3>Get Started</h3>
                </div>

                <div className={styles.checklistItem}>
                    <div className={styles.itemInfo}>
                        <div className={styles.itemNumber}>1</div>
                        <div className={styles.itemText}>
                            <h4>Add your API</h4>
                            <p>Paste your docs URL and API key. Our AI generates the skill registration.</p>
                        </div>
                    </div>
                    <Link href="/publisher/skills/new">
                        <button className={styles.itemButton}>Add Skill</button>
                    </Link>
                </div>

                <div className={styles.checklistItem}>
                    <div className={styles.itemInfo}>
                        <div className={styles.itemNumber}>2</div>
                        <div className={styles.itemText}>
                            <h4>Review & submit</h4>
                            <p>Check the generated metadata, edit if needed, submit for review.</p>
                        </div>
                    </div>
                </div>

                <div className={styles.checklistItem}>
                    <div className={styles.itemInfo}>
                        <div className={styles.itemNumber}>3</div>
                        <div className={styles.itemText}>
                            <h4>Go live</h4>
                            <p>Once approved, agents discover your skill via semantic search. You get a direct link.</p>
                        </div>
                    </div>
                </div>

                <div className={styles.checklistItem}>
                    <div className={styles.itemInfo}>
                        <div className={styles.itemNumber}>4</div>
                        <div className={styles.itemText}>
                            <h4>Earn per call</h4>
                            <p>Every time an agent calls your skill, you earn 85% of the fee.</p>
                        </div>
                    </div>
                </div>
            </div>

            <p style={{ color: "#666", fontSize: 12, marginTop: 16 }}>
                No approval needed to start. Your publisher account is created automatically when you add your first skill.
            </p>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ backgroundColor: "#111111", border: "1px solid #222222", borderRadius: 12, padding: 20 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: 24 }}>{value}</div>
        </div>
    );
}
