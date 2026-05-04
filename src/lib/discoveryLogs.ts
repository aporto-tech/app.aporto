import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { DiscoveredSkill } from "@/lib/routing";

function normalizeQuery(query: string): string {
    return query.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 512);
}

function hashIp(ip: string | null): string | null {
    if (!ip) return null;
    const salt = process.env.DISCOVERY_LOG_IP_SALT ?? process.env.NEXTAUTH_SECRET ?? "aporto-discovery";
    return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function getRequestIp(req: NextRequest): string | null {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || null;
    return req.headers.get("x-real-ip");
}

export async function logSkillDiscovery(params: {
    newApiUserId: number;
    tokenId?: number | null;
    source: "rest" | "mcp";
    query: string;
    page?: number;
    category?: string | null;
    capability?: string | null;
    sessionId?: string | null;
    skills?: DiscoveredSkill[];
    latencyMs?: number;
    error?: string | null;
    userAgent?: string | null;
    ip?: string | null;
}): Promise<void> {
    try {
        const skills = params.skills ?? [];
        await prisma.skillDiscoveryLog.create({
            data: {
                newApiUserId: params.newApiUserId,
                tokenId: params.tokenId ?? null,
                source: params.source,
                query: params.query.slice(0, 2048),
                normalized: normalizeQuery(params.query),
                page: params.page ?? 0,
                category: params.category ?? null,
                capability: params.capability ?? null,
                sessionId: params.sessionId ?? null,
                resultCount: skills.length,
                topSkillIds: skills.length ? JSON.stringify(skills.map((s) => s.id)) : null,
                topSimilarity: skills[0]?.similarity != null ? Number(skills[0].similarity) : null,
                noResults: skills.length === 0 && !params.error,
                latencyMs: params.latencyMs ?? null,
                error: params.error ? params.error.slice(0, 2048) : null,
                userAgent: params.userAgent?.slice(0, 512) ?? null,
                ipHash: hashIp(params.ip ?? null),
            },
        });
    } catch (err) {
        console.error("[logSkillDiscovery] failed:", err);
    }
}
