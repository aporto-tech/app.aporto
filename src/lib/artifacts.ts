import { randomUUID } from "crypto";
import { artifactExpiresAt, copyUrlToR2, uploadToR2 } from "@/lib/r2";

export type StoredArtifact = {
    type: "json" | "csv" | "markdown" | "media";
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

const FILE_URL_RE = /^https?:\/\/\S+\.(pdf|zip|png|jpe?g|webp|gif|mp3|wav|m4a|aac|ogg|mp4|mov|webm|csv|xlsx?|docx?|pptx?|txt|html?|md|xml)(?:[?#]\S*)?$/i;

function extensionForUrl(url: string): string {
    const match = url.match(/\.(pdf|zip|png|jpe?g|webp|gif|mp3|wav|m4a|aac|ogg|mp4|mov|webm|csv|xlsx?|docx?|pptx?|txt|html?|md|xml)(?:[?#]|$)/i);
    return (match?.[1] ?? "bin").toLowerCase().replace("jpeg", "jpg");
}

function contentTypeForExtension(ext: string): string {
    if (ext === "pdf") return "application/pdf";
    if (ext === "zip") return "application/zip";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    if (ext === "mp3") return "audio/mpeg";
    if (ext === "wav") return "audio/wav";
    if (ext === "m4a") return "audio/mp4";
    if (ext === "aac") return "audio/aac";
    if (ext === "ogg") return "audio/ogg";
    if (ext === "mp4") return "video/mp4";
    if (ext === "mov") return "video/quicktime";
    if (ext === "webm") return "video/webm";
    if (ext === "csv") return "text/csv";
    if (ext === "xls") return "application/vnd.ms-excel";
    if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (ext === "doc") return "application/msword";
    if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ext === "ppt") return "application/vnd.ms-powerpoint";
    if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (ext === "txt") return "text/plain";
    if (ext === "html" || ext === "htm") return "text/html";
    if (ext === "md") return "text/markdown";
    if (ext === "xml") return "application/xml";
    return "application/octet-stream";
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

function markdownCell(value: unknown): string {
    if (value == null) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function toMarkdownTable(rows: Record<string, unknown>[], maxRows = 100): string {
    const visibleRows = rows.slice(0, maxRows);
    const headers = Array.from(new Set(visibleRows.flatMap((row) => Object.keys(row)))).slice(0, 16);
    if (!headers.length) return "";
    const lines = [
        `| ${headers.map(markdownCell).join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...visibleRows.map((row) => `| ${headers.map((header) => markdownCell(row[header])).join(" | ")} |`),
    ];
    if (rows.length > maxRows) {
        lines.push("");
        lines.push(`Showing ${maxRows} of ${rows.length} rows. Full data is available in CSV/JSON artifacts.`);
    }
    return `${lines.join("\n")}\n`;
}

function extractTextResult(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (!isPlainObject(value)) return null;
    const direct = value.content ?? value.text ?? value.answer ?? value.result;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    return null;
}

async function copyMediaUrls(value: unknown, prefix: string, expiresAt: Date): Promise<{
    value: unknown;
    artifacts: StoredArtifact[];
}> {
    const copied = new Map<string, StoredArtifact>();

    async function visit(node: unknown): Promise<unknown> {
        if (typeof node === "string") {
            if (!FILE_URL_RE.test(node)) return node;

            const existing = copied.get(node);
            if (existing) return existing.url;

            const ext = extensionForUrl(node);
            const key = `${prefix}-media-${copied.size + 1}.${ext}`;
            const url = await copyUrlToR2(node, key, contentTypeForExtension(ext), { expiresAt });
            const artifact: StoredArtifact = {
                type: "media",
                url,
                storage_key: key,
                expires_at: expiresAt.toISOString(),
                content_type: contentTypeForExtension(ext),
            };
            copied.set(node, artifact);
            return url;
        }

        if (Array.isArray(node)) {
            return Promise.all(node.map((item) => visit(item)));
        }

        if (isPlainObject(node)) {
            const entries = await Promise.all(
                Object.entries(node).map(async ([key, item]) => [key, await visit(item)] as const),
            );
            return Object.fromEntries(entries);
        }

        return node;
    }

    return {
        value: await visit(value),
        artifacts: Array.from(copied.values()),
    };
}

export async function storeSkillResultArtifacts(input: StoreSkillArtifactsInput): Promise<{
    artifact: StoredArtifact;
    artifacts: StoredArtifact[];
}> {
    const expiresAt = artifactExpiresAt();
    const prefix = keyPrefix(input);
    const mediaCopy = await copyMediaUrls(input.result, prefix, expiresAt);

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
        result: mediaCopy.value,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
    };

    const artifacts: StoredArtifact[] = [];
    artifacts.push(...mediaCopy.artifacts);

    const jsonKey = `${prefix}.json`;
    const jsonUrl = await uploadToR2(
        jsonKey,
        Buffer.from(JSON.stringify(payload, null, 2)),
        "application/json",
        { expiresAt },
    );
    const jsonArtifact: StoredArtifact = {
        type: "json",
        url: jsonUrl,
        storage_key: jsonKey,
        expires_at: expiresAt.toISOString(),
        content_type: "application/json",
    };

    const rows = findTabularRows(mediaCopy.value);
    if (rows) {
        const markdownKey = `${prefix}.md`;
        const markdownUrl = await uploadToR2(
            markdownKey,
            Buffer.from(toMarkdownTable(rows)),
            "text/markdown; charset=utf-8",
            { expiresAt },
        );
        artifacts.push({
            type: "markdown",
            url: markdownUrl,
            storage_key: markdownKey,
            expires_at: expiresAt.toISOString(),
            content_type: "text/markdown; charset=utf-8",
        });

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
    } else {
        const textResult = extractTextResult(mediaCopy.value);
        if (textResult && textResult.length > 1500) {
            const markdownKey = `${prefix}.md`;
            const markdownUrl = await uploadToR2(
                markdownKey,
                Buffer.from(`${textResult}\n`),
                "text/markdown; charset=utf-8",
                { expiresAt },
            );
            artifacts.push({
                type: "markdown",
                url: markdownUrl,
                storage_key: markdownKey,
                expires_at: expiresAt.toISOString(),
                content_type: "text/markdown; charset=utf-8",
            });
        }
    }

    artifacts.push(jsonArtifact);

    return {
        artifact: artifacts[0] ?? jsonArtifact,
        artifacts,
    };
}
