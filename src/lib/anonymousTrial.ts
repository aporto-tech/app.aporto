import { createHash, randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestIp } from "@/lib/discoveryLogs";

export const TRIAL_LIMIT_MESSAGE =
    "Free trial limit reached. Get an API key at https://aporto.tech to keep running Aporto skills.";

const CLIENT_LIMIT = Math.max(Number(process.env.APORTO_TRIAL_CLIENT_LIMIT ?? 2) || 2, 1);
const IP_LIMIT = Math.max(Number(process.env.APORTO_TRIAL_IP_LIMIT ?? 10) || 10, CLIENT_LIMIT);
const WINDOW_HOURS = Math.max(Number(process.env.APORTO_TRIAL_WINDOW_HOURS ?? 24) || 24, 1);

function normalizeIp(ip: string | null): string {
    if (!ip) return "unknown";
    const value = ip.trim().toLowerCase();
    if (!value.includes(":")) return value;
    const parts = value.split(":");
    return parts.length > 4 ? parts.slice(0, 4).join(":") : value;
}

export function hashTrialIp(ip: string | null): string {
    const salt = process.env.TRIAL_USAGE_IP_SALT ?? process.env.NEXTAUTH_SECRET ?? "aporto-trial";
    return createHash("sha256").update(`${salt}:${normalizeIp(ip)}`).digest("hex").slice(0, 32);
}

export function getTrialIpHash(req: NextRequest): string {
    return hashTrialIp(getRequestIp(req));
}

export async function reserveAnonymousTrialRun(input: {
    anonymousClientId?: string | null;
    ipHash: string;
    skillId?: number | null;
}): Promise<{ allowed: true; usageId: string } | { allowed: false; reason: string; message: string }> {
    const clientId = input.anonymousClientId?.trim().slice(0, 128) || null;
    const usageId = randomUUID();

    return prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
            `SELECT pg_advisory_xact_lock(hashtext($1))`,
            `trial-ip:${input.ipHash}`,
        );
        if (clientId) {
            await tx.$executeRawUnsafe(
                `SELECT pg_advisory_xact_lock(hashtext($1))`,
                `trial-client:${clientId}`,
            );
        }

        const clientRows = clientId
            ? await tx.$queryRawUnsafe<{ count: number }[]>(
                `SELECT COUNT(*)::int AS count
                 FROM "AnonymousSkillUsage"
                 WHERE "anonymousClientId" = $1
                   AND "createdAt" > NOW() - ($2::int * INTERVAL '1 hour')`,
                clientId,
                WINDOW_HOURS,
            )
            : [{ count: 0 }];
        const ipRows = await tx.$queryRawUnsafe<{ count: number }[]>(
            `SELECT COUNT(*)::int AS count
             FROM "AnonymousSkillUsage"
             WHERE "ipHash" = $1
               AND "createdAt" > NOW() - ($2::int * INTERVAL '1 hour')`,
            input.ipHash,
            WINDOW_HOURS,
        );

        if (clientId && Number(clientRows[0]?.count ?? 0) >= CLIENT_LIMIT) {
            return { allowed: false, reason: "client_limit", message: TRIAL_LIMIT_MESSAGE };
        }
        if (Number(ipRows[0]?.count ?? 0) >= IP_LIMIT) {
            return { allowed: false, reason: "ip_limit", message: TRIAL_LIMIT_MESSAGE };
        }

        await tx.$executeRawUnsafe(
            `INSERT INTO "AnonymousSkillUsage" (id, "anonymousClientId", "ipHash", "skillId", status, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'started', NOW(), NOW())`,
            usageId,
            clientId,
            input.ipHash,
            input.skillId ?? null,
        );
        return { allowed: true, usageId };
    });
}

export async function completeAnonymousTrialRun(input: {
    usageId: string;
    status: string;
    skillId?: number | null;
    runId?: string | null;
}): Promise<void> {
    await prisma.$executeRawUnsafe(
        `UPDATE "AnonymousSkillUsage"
         SET status = $2,
             "skillId" = COALESCE($3, "skillId"),
             "runId" = COALESCE($4, "runId"),
             "updatedAt" = NOW()
         WHERE id = $1`,
        input.usageId,
        input.status,
        input.skillId ?? null,
        input.runId ?? null,
    );
}
