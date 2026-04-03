"use client";
import React from "react";

const pulse: React.CSSProperties = {
    background: "linear-gradient(90deg, #1a1a1a 25%, #242424 50%, #1a1a1a 75%)",
    backgroundSize: "200% 100%",
    animation: "skeleton-pulse 1.4s ease-in-out infinite",
    borderRadius: 6,
};

export function Skeleton({ width = "100%", height = 16, style }: {
    width?: string | number;
    height?: number;
    style?: React.CSSProperties;
}) {
    return (
        <>
            <style>{`@keyframes skeleton-pulse{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
            <div style={{ ...pulse, width, height, ...style }} />
        </>
    );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} width={i === 0 ? "60%" : "100%"} height={i === 0 ? 18 : 13} />
            ))}
        </div>
    );
}

export function SkeletonRow() {
    return (
        <div style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #1a1a1a", alignItems: "center" }}>
            <Skeleton width={32} height={32} style={{ borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <Skeleton width="50%" height={13} />
                <Skeleton width="30%" height={11} />
            </div>
            <Skeleton width={60} height={13} style={{ flexShrink: 0 }} />
        </div>
    );
}
