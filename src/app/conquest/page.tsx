"use client"

import { useEffect, useState, useCallback } from "react"
import { Cinzel, Crimson_Text } from "next/font/google"
import styles from "./conquest.module.css"

const cinzel = Cinzel({ subsets: ["latin"], weight: ["400", "700", "900"] })
const crimson = Crimson_Text({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"] })

type OwnerType = "claimed" | "dark_lord" | "founding_keep" | "fog"

interface Province {
    model_id: string
    display_name: string
    owner_type: OwnerType
    owner_name: string | null
    total_tokens_30d: number
}

interface Kingdom {
    id: string
    name: string
    dark_lord: string
    order: number
    provinces: Province[]
    claimed_count: number
    dark_lord_count: number
}

interface MapData {
    kingdoms: Kingdom[]
    updated_at: string
    stats: {
        total_kingdoms: number
        total_provinces: number
        total_claimed: number
        week: number
    }
}

function timeAgoStr(date: Date): string {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return "just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
}

function formatTokens(n: number): string {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
    return String(n)
}

const OWNER_ICONS: Record<OwnerType, string> = {
    claimed:       "⚔️",
    dark_lord:     "💀",
    founding_keep: "🏰",
    fog:           "🌫️",
}

export default function ConquestPage() {
    const [data, setData] = useState<MapData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
    const [timeAgo, setTimeAgo] = useState("")

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch("/api/conquest/map")
            if (!res.ok) throw new Error("fetch failed")
            const json: MapData = await res.json()
            setData(json)
            setUpdatedAt(new Date(json.updated_at))
            setError(false)
        } catch {
            setError(true)
        } finally {
            setLoading(false)
        }
    }, [])

    // Initial load + auto-refresh every 5 minutes
    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 5 * 60 * 1000)
        return () => clearInterval(interval)
    }, [fetchData])

    // Update "X min ago" every 30 seconds
    useEffect(() => {
        if (!updatedAt) return
        setTimeAgo(timeAgoStr(updatedAt))
        const t = setInterval(() => setTimeAgo(timeAgoStr(updatedAt)), 30_000)
        return () => clearInterval(t)
    }, [updatedAt])

    return (
        <div className={`${styles.page} ${cinzel.className}`}>
            {/* Particle overlay */}
            <div className={styles.particles} aria-hidden="true" />

            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <p className={`${styles.weekLabel} ${crimson.className}`}>
                        ⚔ STATE OF THE AI KINGDOMS ⚔
                    </p>
                    <h1 className={styles.title}>
                        THE AI CONQUEST MAP
                    </h1>
                    {data && (
                        <p className={`${styles.weekSub} ${crimson.className}`}>
                            Week {data.stats.week} &nbsp;·&nbsp;
                            <span className={styles.statHighlight}>{data.stats.total_claimed}</span> provinces claimed &nbsp;·&nbsp;
                            <span className={styles.statHighlight}>{data.stats.total_provinces}</span> total &nbsp;·&nbsp;
                            {timeAgo ? `Updated ${timeAgo}` : "Loading..."}
                        </p>
                    )}
                </div>
            </header>

            {/* Legend */}
            <div className={`${styles.legend} ${crimson.className}`}>
                <span className={styles.legendClaimed}>{OWNER_ICONS.claimed} Claimed</span>
                <span className={styles.legendDarkLord}>{OWNER_ICONS.dark_lord} Dark Lord</span>
                <span className={styles.legendFounding}>{OWNER_ICONS.founding_keep} Founding Keep</span>
                <span className={styles.legendFog}>{OWNER_ICONS.fog} Unexplored</span>
            </div>

            {/* Content */}
            <main className={styles.main}>
                {loading && (
                    <div className={styles.loadingState}>
                        <div className={styles.loadingGlow} />
                        <p className={`${styles.loadingText} ${crimson.className}`}>
                            Consulting the ancient scrolls...
                        </p>
                    </div>
                )}

                {error && !loading && (
                    <div className={styles.errorState}>
                        <p className={crimson.className}>
                            The map is obscured by dark magic. Refresh to try again.
                        </p>
                    </div>
                )}

                {data && !loading && (
                    <div className={styles.kingdoms}>
                        {data.kingdoms.map((kingdom) => (
                            <KingdomCard key={kingdom.id} kingdom={kingdom} />
                        ))}
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className={`${styles.footer} ${crimson.className}`}>
                <a href="https://aporto.tech" className={styles.footerLink} target="_blank" rel="noopener noreferrer">
                    aporto.tech
                </a>
                <span className={styles.footerSep}>·</span>
                <span>AI API Gateway</span>
                <span className={styles.footerSep}>·</span>
                <span>Territories update every 5 minutes</span>
            </footer>
        </div>
    )
}

function KingdomCard({ kingdom }: { kingdom: Kingdom }) {
    const totalProvinces = kingdom.provinces.length
    const claimedPct = totalProvinces > 0
        ? Math.round((kingdom.claimed_count / totalProvinces) * 100)
        : 0

    const kingdomClass = kingdom.claimed_count > 0
        ? styles.kingdomActive
        : styles.kingdomDark

    return (
        <div className={`${styles.kingdom} ${kingdomClass}`}>
            {/* Kingdom header */}
            <div className={styles.kingdomHeader}>
                <h2 className={styles.kingdomName}>{kingdom.name}</h2>
                <div className={styles.kingdomStats}>
                    {kingdom.claimed_count > 0 ? (
                        <span className={styles.kingdomClaimed}>
                            {kingdom.claimed_count}/{totalProvinces} claimed
                        </span>
                    ) : (
                        <span className={styles.kingdomUnclaimed}>
                            {kingdom.dark_lord}
                        </span>
                    )}
                </div>
            </div>

            {/* Conquest progress bar */}
            <div className={styles.progressBar}>
                <div
                    className={styles.progressFill}
                    style={{ width: `${claimedPct}%` }}
                />
            </div>

            {/* Province list */}
            <ul className={styles.provinces}>
                {kingdom.provinces.map((province) => (
                    <ProvinceRow key={province.model_id} province={province} />
                ))}
                {kingdom.provinces.length === 0 && (
                    <li className={`${styles.province} ${styles.fogProvince}`}>
                        <span className={styles.provinceName}>Here be Dragons</span>
                    </li>
                )}
            </ul>
        </div>
    )
}

function ProvinceRow({ province }: { province: Province }) {
    const provinceClass = {
        claimed:       styles.claimedProvince,
        dark_lord:     styles.darkLordProvince,
        founding_keep: styles.foundingProvince,
        fog:           styles.fogProvince,
    }[province.owner_type]

    return (
        <li className={`${styles.province} ${provinceClass}`}>
            <span className={styles.provinceIcon}>{OWNER_ICONS[province.owner_type]}</span>
            <span className={styles.provinceName} title={province.model_id}>
                {province.display_name}
            </span>
            <span className={styles.provinceOwner}>
                {province.owner_name ?? "Unexplored"}
            </span>
            {province.total_tokens_30d > 0 && (
                <span className={styles.provinceTokens}>
                    {formatTokens(province.total_tokens_30d)}
                </span>
            )}
        </li>
    )
}
