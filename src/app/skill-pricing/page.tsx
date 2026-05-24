"use client";

import React, { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./skill-pricing.module.css";

type SkillPrice = {
    skillId: number;
    name: string;
    description: string;
    category: string | null;
    capabilities: string[];
    tags: string[];
    providerCount: number;
    priceLabel: string;
};

type PricingResponse = {
    success: boolean;
    updatedAt?: string;
    skills?: SkillPrice[];
    message?: string;
};

const DEFAULT_CAPABILITIES = ["video", "llm", "audio", "image", "search", "scrape", "browser", "sms"];

function matchesToken(skill: SkillPrice, token: string): boolean {
    const normalized = token.toLowerCase();
    const haystack = [
        skill.name,
        skill.description,
        skill.category ?? "",
        ...skill.capabilities,
        ...skill.tags,
    ].join(" ").toLowerCase();
    return haystack.includes(normalized);
}

export default function SkillPricingPage() {
    const [skills, setSkills] = useState<SkillPrice[]>([]);
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [capability, setCapability] = useState("all");
    const [tag, setTag] = useState("all");

    useEffect(() => {
        let cancelled = false;
        async function loadPricing() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch("/api/skills/pricing", { cache: "no-store" });
                const data = await res.json() as PricingResponse;
                if (!res.ok || !data.success) throw new Error(data.message ?? "Failed to load skill pricing.");
                if (!cancelled) {
                    setSkills(data.skills ?? []);
                    setUpdatedAt(data.updatedAt ?? null);
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadPricing();
        return () => {
            cancelled = true;
        };
    }, []);

    const capabilities = useMemo(() => {
        const values = new Set(DEFAULT_CAPABILITIES);
        for (const skill of skills) {
            for (const value of skill.capabilities) values.add(value);
            if (skill.category) values.add(skill.category.split("/")[0]);
        }
        return Array.from(values).filter(Boolean).slice(0, 24);
    }, [skills]);

    const tags = useMemo(() => {
        const counts = new Map<string, number>();
        for (const skill of skills) {
            for (const value of skill.tags) counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 80)
            .map(([value]) => value);
    }, [skills]);

    const filteredSkills = useMemo(() => {
        const text = query.trim().toLowerCase();
        return skills.filter((skill) => {
            if (capability !== "all" && !matchesToken(skill, capability)) return false;
            if (tag !== "all" && !skill.tags.includes(tag)) return false;
            if (!text) return true;
            return matchesToken(skill, text);
        });
    }, [skills, query, capability, tag]);

    return (
        <DashboardLayout>
            <div className={styles.container}>
                <header className={styles.header}>
                    <div>
                        <h1>Skill Pricing</h1>
                        <p>Live catalog pricing from active Aporto skill providers.</p>
                    </div>
                    <div className={styles.meta}>
                        <span>{skills.length} skills</span>
                        {updatedAt && <span>Updated {new Date(updatedAt).toLocaleString()}</span>}
                    </div>
                </header>

                <section className={styles.controls} aria-label="Skill pricing filters">
                    <label className={styles.searchBox}>
                        <span>Search</span>
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search skills, tags, capabilities..."
                        />
                    </label>
                    <label className={styles.selectBox}>
                        <span>Tag</span>
                        <select value={tag} onChange={(event) => setTag(event.target.value)}>
                            <option value="all">All tags</option>
                            {tags.map((value) => (
                                <option key={value} value={value}>{value}</option>
                            ))}
                        </select>
                    </label>
                </section>

                <div className={styles.capabilities} aria-label="Capabilities">
                    <button className={capability === "all" ? styles.activeChip : styles.chip} onClick={() => setCapability("all")}>All</button>
                    {capabilities.map((value) => (
                        <button
                            key={value}
                            className={capability === value ? styles.activeChip : styles.chip}
                            onClick={() => setCapability(value)}
                        >
                            {value}
                        </button>
                    ))}
                </div>

                <div className={styles.resultsBar}>
                    <span>{filteredSkills.length} matching skills</span>
                    {(query || capability !== "all" || tag !== "all") && (
                        <button
                            type="button"
                            onClick={() => {
                                setQuery("");
                                setCapability("all");
                                setTag("all");
                            }}
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className={styles.state}>Loading skill pricing...</div>
                ) : error ? (
                    <div className={styles.state}>Could not load pricing: {error}</div>
                ) : (
                    <div className={styles.skillList}>
                        {filteredSkills.map((skill) => (
                            <article key={skill.skillId} className={styles.skillRow}>
                                <div className={styles.skillMain}>
                                    <div className={styles.skillTitleRow}>
                                        <h2>{skill.name}</h2>
                                        {skill.category && <span>{skill.category}</span>}
                                    </div>
                                    <p>{skill.description}</p>
                                    <div className={styles.tagList}>
                                        {skill.capabilities.slice(0, 4).map((value) => <span key={`cap-${skill.skillId}-${value}`}>{value}</span>)}
                                        {skill.tags.slice(0, 4).map((value) => <span key={`tag-${skill.skillId}-${value}`}>{value}</span>)}
                                    </div>
                                </div>
                                <div className={styles.priceBlock}>
                                    <strong>{skill.priceLabel}</strong>
                                    <span>{skill.providerCount} active provider{skill.providerCount === 1 ? "" : "s"}</span>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
