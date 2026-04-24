import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Resolve a dot-notation path from an object, e.g. "labels.gender" → obj.labels?.gender
function dotGet(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>((acc, key) => {
        if (acc !== null && acc !== undefined && typeof acc === "object") {
            return (acc as Record<string, unknown>)[key];
        }
        return undefined;
    }, obj);
}

interface SyncMapping {
    optionKey: string;
    label: string;
    metadata: Record<string, string>;
}

interface SyncConfig {
    auth: "none" | "bearer";
    dataPath: string;
    mapping: SyncMapping;
    optionType: string;
}

export async function POST(req: Request) {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providers = await prisma.provider.findMany({
        where: { syncEndpoint: { not: null } },
    });

    const results: Array<{
        providerId: number;
        synced?: number;
        added?: number;
        deactivated?: number;
        error?: string;
    }> = [];

    for (const provider of providers) {
        if (!provider.syncEndpoint || !provider.syncConfig) {
            results.push({ providerId: provider.id, error: "missing syncEndpoint or syncConfig" });
            continue;
        }

        let config: SyncConfig;
        try {
            config = JSON.parse(provider.syncConfig) as SyncConfig;
        } catch {
            results.push({ providerId: provider.id, error: "invalid syncConfig JSON" });
            continue;
        }

        // Fetch from provider
        let items: Record<string, unknown>[];
        try {
            const headers: Record<string, string> = {};
            if (config.auth === "bearer" && provider.providerSecret) {
                headers["Authorization"] = `Bearer ${provider.providerSecret}`;
            }

            const res = await fetch(provider.syncEndpoint, { headers });

            if (res.status === 401 || res.status === 403) {
                console.warn(`[sync-provider-options] Provider ${provider.id} auth failed (${res.status}) — skipping`);
                results.push({ providerId: provider.id, error: `auth failed: ${res.status}` });
                continue;
            }
            if (res.status === 429) {
                console.warn(`[sync-provider-options] Provider ${provider.id} rate limited — skipping`);
                results.push({ providerId: provider.id, error: "rate limited" });
                continue;
            }
            if (!res.ok) {
                console.warn(`[sync-provider-options] Provider ${provider.id} fetch failed: ${res.status}`);
                results.push({ providerId: provider.id, error: `fetch failed: ${res.status}` });
                continue;
            }

            const body = await res.json() as Record<string, unknown>;
            const raw = dotGet(body, config.dataPath);
            if (!Array.isArray(raw)) {
                console.error(`[sync-provider-options] Provider ${provider.id} dataPath "${config.dataPath}" is not an array`);
                results.push({ providerId: provider.id, error: `dataPath "${config.dataPath}" not an array` });
                continue;
            }
            items = raw as Record<string, unknown>[];
        } catch (err) {
            console.error(`[sync-provider-options] Provider ${provider.id} fetch error:`, err);
            results.push({ providerId: provider.id, error: String(err) });
            continue;
        }

        // Map items to ProviderOption fields
        const mapped = items.map((item) => {
            const optionKey = String(dotGet(item, config.mapping.optionKey) ?? "");
            const label = String(dotGet(item, config.mapping.label) ?? "");
            const metadata: Record<string, unknown> = {};
            for (const [metaKey, itemPath] of Object.entries(config.mapping.metadata)) {
                metadata[metaKey] = dotGet(item, itemPath);
            }
            return { optionKey, label, metadata };
        }).filter(({ optionKey }) => optionKey !== "");

        const syncedKeys = mapped.map(({ optionKey }) => optionKey);

        // Sync in a transaction: upsert live + deactivate removed
        try {
            await prisma.$transaction(async (tx) => {
                for (const { optionKey, label, metadata } of mapped) {
                    await tx.providerOption.upsert({
                        where: {
                            providerId_skillId_optionType_optionKey: {
                                providerId: provider.id,
                                skillId:    provider.skillId,
                                optionType: config.optionType,
                                optionKey,
                            },
                        },
                        update: {
                            label,
                            metadata: metadata as Prisma.InputJsonValue,
                            isActive:     true,
                            lastSyncedAt: new Date(),
                        },
                        create: {
                            providerId:  provider.id,
                            skillId:     provider.skillId,
                            optionType:  config.optionType,
                            optionKey,
                            label,
                            metadata: metadata as Prisma.InputJsonValue,
                            isActive:    true,
                        },
                    });
                }

                // Deactivate anything not in this sync run
                if (syncedKeys.length > 0) {
                    await tx.providerOption.updateMany({
                        where: {
                            providerId: provider.id,
                            skillId:    provider.skillId,
                            optionType: config.optionType,
                            optionKey:  { notIn: syncedKeys },
                            isActive:   true,
                        },
                        data: { isActive: false },
                    });
                }
            });

            console.log(`[sync-provider-options] Provider ${provider.id}: ${mapped.length} options synced`);
            results.push({ providerId: provider.id, synced: mapped.length });
        } catch (err) {
            console.error(`[sync-provider-options] Provider ${provider.id} DB error:`, err);
            results.push({ providerId: provider.id, error: `db error: ${String(err)}` });
        }
    }

    return NextResponse.json({ success: true, results });
}
