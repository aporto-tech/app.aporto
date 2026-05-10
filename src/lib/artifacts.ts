import { randomUUID } from "crypto";
import { artifactExpiresAt, uploadToR2 } from "@/lib/r2";

export type StoredArtifact = {
    type: "json" | "csv";
    url: string;
    storage_key: string;
    expires_at: string;
    content_type: string;
};

type StoreSkillArtifactsInput = {
    source: "rest" | "mcp";
    userId: number;
    sessionId: string;
    skillId: number;
    providerId?: number;
    providerName?: string;
    skillCallId?: number;
    costUSD?: number;
    params?: Record<string, unknown>;
    result: unknown;
};

function datePrefix(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

function keyPrefix(input: StoreSkillArtifactsInput, now = new Date()): string {
    const callPart = input.skillCallId ? `call-${input.skillCallId}` : randomUUID();
    return `skill-results/${datePrefix(now)}/user-${input.userId}/skill-${input.skillId}/${callPart}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findTabularRows(value: unknown): Record<string, unknown>[] | null {
    if (Array.isArray(value) && value.length > 0 && value.every(isPlainObject)) {
        return value as Record<string, unknown>[];
    }

    if (!isPlainObject(value)) return null;

    for (const key of ["rows", "items", "results", "data"]) {
        const child = value[key];
        if (Array.isArray(child) && child.length > 0 && child.every(isPlainObject)) {
            return child as Record<string, unknown>[];
        }
    }

    return null;
}

function csvCell(value: unknown): string {
    if (value == null) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Record<string, unknown>[]): string {
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const lines = [
        headers.map(csvCell).join(","),
        ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
    ];
    return `${lines.join("\n")}\n`;
}

export async function storeSkillResultArtifacts(input: StoreSkillArtifactsInput): Promise<{
    artifact: StoredArtifact;
    artifacts: StoredArtifact[];
}> {
    const expiresAt = artifactExpiresAt();
    const prefix = keyPrefix(input);

    const payload = {
        source: input.source,
        user_id: input.userId,
        session_id: input.sessionId,
        skill_id: input.skillId,
        provider_id: input.providerId,
        provider_name: input.providerName,
        skill_call_id: input.skillCallId,
        cost_usd: input.costUSD,
        params: input.params,
        result: input.result,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
    };

    const jsonKey = `${prefix}.json`;
    const jsonUrl = await uploadToR2(
        jsonKey,
        Buffer.from(JSON.stringify(payload, null, 2)),
        "application/json",
        { expiresAt },
    );

    const artifacts: StoredArtifact[] = [{
        type: "json",
        url: jsonUrl,
        storage_key: jsonKey,
        expires_at: expiresAt.toISOString(),
        content_type: "application/json",
    }];

    const rows = findTabularRows(input.result);
    if (rows) {
        const csvKey = `${prefix}.csv`;
        const csvUrl = await uploadToR2(
            csvKey,
            Buffer.from(toCsv(rows)),
            "text/csv",
            { expiresAt },
        );
        artifacts.push({
            type: "csv",
            url: csvUrl,
            storage_key: csvKey,
            expires_at: expiresAt.toISOString(),
            content_type: "text/csv",
        });
    }

    return {
        artifact: artifacts[0],
        artifacts,
    };
}
