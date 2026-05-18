#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { AportoClient } from "./index";
import { AportoConfigError } from "./errors";

const MIME_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".pdf": "application/pdf", ".json": "application/json",
    ".txt": "text/plain", ".csv": "text/csv",
};

type Flags = Record<string, string | boolean | string[]>;

function usage(): string {
    return [
        "Usage:",
        "  aporto discover <intent> [--category <value>] [--capability <value>] [--page <n>] [--json]",
        "  aporto skills search <intent> [--json]",
        "  aporto run <skillId-or-intent> [--provider <hint>] [--params <file.json>] [--param key=value] [--file key=path] [--wait] [--max-wait <seconds>] [--session <id>] [--json]",
        "  aporto runs get <runId> [--json]",
        "  aporto runs wait <runId> [--max-wait <seconds>] [--timeout <seconds>] [--interval <seconds>] [--json]",
        "",
        "Flags:",
        "  --json             Output as JSON (useful for AI agents and scripting)",
        "  --wait             Wait for skill execution to complete before returning",
        "  --no-wait          Do not wait (default for async skills)",
        "  --max-wait <sec>   Maximum seconds to wait for completion (default: 300)",
        "  --provider <hint>  Provider preference (name or 'auto')",
        "  --param key=value  Set a parameter (repeatable)",
        "  --file key=path    Attach a local file as a parameter (repeatable, base64-encoded)",
        "  --params <file>    Load parameters from a JSON file",
        "  --session <id>     Session ID for retry deduplication",
        "  --category <val>   Filter skills by category (e.g. media/image, search/web)",
        "  --capability <val> Filter skills by capability (e.g. generate, search)",
        "  --page <n>         Pagination offset (5 results per page)",
        "  --timeout <sec>    Timeout for polling (runs wait)",
        "  --interval <sec>   Poll interval in seconds (runs wait)",
        "",
        "Environment:",
        "  APORTO_API_KEY      required for run/paid commands; optional for discover",
        "  APORTO_BASE_URL     optional, defaults to https://app.aporto.tech",
    ].join("\n");
}

function parseArgs(argv: string[]): { args: string[]; flags: Flags } {
    const args: string[] = [];
    const flags: Flags = {};

    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith("--")) {
            args.push(token);
            continue;
        }

        const raw = token.slice(2);
        const eqIndex = raw.indexOf("=");
        const key = eqIndex >= 0 ? raw.slice(0, eqIndex) : raw;
        const inlineValue = eqIndex >= 0 ? raw.slice(eqIndex + 1) : undefined;

        if (key === "json" || key === "wait") {
            flags[key] = true;
            continue;
        }
        if (key === "no-wait") {
            flags.wait = false;
            continue;
        }

        const value = inlineValue ?? argv[++i];
        if (value === undefined) {
            throw new AportoConfigError(`Missing value for --${key}`);
        }

        if (key === "param" || key === "file") {
            const existing = flags[key];
            flags[key] = Array.isArray(existing) ? [...existing, value] : existing ? [String(existing), value] : [value];
        } else {
            flags[key] = value;
        }
    }

    return { args, flags };
}

function flagString(flags: Flags, key: string): string | undefined {
    const value = flags[key];
    return typeof value === "string" ? value : undefined;
}

function flagNumber(flags: Flags, key: string): number | undefined {
    const value = flagString(flags, key);
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new AportoConfigError(`--${key} must be a number`);
    return parsed;
}

function parseScalar(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (trimmed === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith('"')) {
        return JSON.parse(trimmed);
    }
    return value;
}

function readParams(flags: Flags): Record<string, unknown> {
    let params: Record<string, unknown> = {};
    const file = flagString(flags, "params");
    if (file) {
        params = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
        if (params === null || typeof params !== "object" || Array.isArray(params)) {
            throw new AportoConfigError("--params must point to a JSON object");
        }
    }

    const inline = flags.param;
    const values = Array.isArray(inline) ? inline : inline ? [String(inline)] : [];
    for (const pair of values) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex <= 0) throw new AportoConfigError("--param must be key=value");
        const key = pair.slice(0, eqIndex);
        const value = pair.slice(eqIndex + 1);
        params[key] = parseScalar(value);
    }

    const files = flags.file;
    const fileValues = Array.isArray(files) ? files : files ? [String(files)] : [];
    for (const pair of fileValues) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex <= 0) throw new AportoConfigError("--file must be key=path (e.g. --file image=./photo.jpg)");
        const key = pair.slice(0, eqIndex);
        const path = pair.slice(eqIndex + 1);
        const ext = extname(path).toLowerCase();
        const mimeType = MIME_TYPES[ext] || "application/octet-stream";
        const data = readFileSync(path).toString("base64");
        params[key] = { _file: true, name: basename(path), mimeType, data };
    }

    return params;
}

function printJson(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printSkills(result: { skills?: Array<{ id?: number; skillId?: number; name?: string; category?: string | null; similarity?: number; priceUSD?: number | null }> }): void {
    const skills = result.skills ?? [];
    if (skills.length === 0) {
        process.stdout.write("No matching skills found.\n");
        return;
    }
    for (const skill of skills) {
        const id = skill.skillId ?? skill.id;
        const price = skill.priceUSD != null ? `  $${skill.priceUSD < 0.001 ? skill.priceUSD.toExponential(1) : skill.priceUSD.toFixed(4)}/call` : "";
        process.stdout.write(`${id}\t${skill.name ?? "Unnamed skill"}${skill.category ? `  ${skill.category}` : ""}${price}\n`);
    }
}

function printRun(result: { status?: string; runId?: string; skillId?: number; skillName?: string; provider?: string; costUSD?: number; artifacts?: Array<{ url?: string }>; artifact?: { url?: string }; error?: { message?: string; code?: string }; choices?: Array<{ skillId?: number; id?: number; name?: string }> }): void {
    process.stdout.write(`status: ${result.status ?? "unknown"}\n`);
    if (result.runId) process.stdout.write(`runId: ${result.runId}\n`);
    if (result.skillId) process.stdout.write(`skillId: ${result.skillId}\n`);
    if (result.skillName) process.stdout.write(`skill: ${result.skillName}\n`);
    if (result.provider) process.stdout.write(`provider: ${result.provider}\n`);
    if (result.costUSD !== undefined) process.stdout.write(`costUSD: ${result.costUSD}\n`);

    const urls = [
        ...(result.artifacts ?? []).map((artifact) => artifact.url).filter(Boolean),
        result.artifact?.url,
    ].filter(Boolean);
    for (const url of urls) process.stdout.write(`artifact: ${url}\n`);

    if (result.choices?.length) {
        process.stdout.write("choices:\n");
        for (const choice of result.choices) {
            process.stdout.write(`  ${choice.skillId ?? choice.id}\t${choice.name ?? "Unnamed skill"}\n`);
        }
    }

    if (result.error) {
        process.stdout.write(`error: ${result.error.code ? `${result.error.code}: ` : ""}${result.error.message ?? "Unknown error"}\n`);
    }
}

async function discoverSkills(params: {
    appBaseUrl: string;
    apiKey?: string;
    query: string;
    category?: string;
    capability?: string;
    page: number;
}): Promise<{ skills: Array<{ id?: number; skillId?: number; name?: string; category?: string | null; similarity?: number; priceUSD?: number | null }>; page: number; authWarning?: string }> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Agent-Name": "aporto-cli",
    };
    if (params.apiKey) headers.Authorization = `Bearer ${params.apiKey}`;

    const url = `${params.appBaseUrl.replace(/\/$/, "")}/api/routing/skills`;
    const body = JSON.stringify({
        query: params.query,
        category: params.category,
        capability: params.capability,
        page: params.page,
    });

    let res = await fetch(url, {
        method: "POST",
        headers,
        body,
    });

    let authWarning: string | undefined;
    if (res.status === 401 && params.apiKey) {
        authWarning = "APORTO_API_KEY was rejected by app.aporto.tech. Discovery was retried without auth; run commands will still fail until you use a valid key.";
        const publicHeaders = { ...headers };
        delete publicHeaders.Authorization;
        res = await fetch(url, {
            method: "POST",
            headers: publicHeaders,
            body,
        });
    }

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AportoConfigError(`Discovery failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
    }

    const data = await res.json() as { skills: Array<{ id?: number; skillId?: number; name?: string; category?: string | null; similarity?: number; priceUSD?: number | null }>; page: number };
    return { ...data, authWarning };
}

async function main() {
    const { args, flags } = parseArgs(process.argv.slice(2));
    const command = args[0];

    if (!command || command === "help" || command === "--help" || command === "-h") {
        process.stdout.write(`${usage()}\n`);
        return;
    }

    const apiKey = process.env.APORTO_API_KEY;
    const appBaseUrl = process.env.APORTO_BASE_URL ?? "https://app.aporto.tech";
    const asJson = flags.json === true;

    if (command === "discover" || (command === "skills" && args[1] === "search")) {
        const offset = command === "skills" ? 2 : 1;
        const query = args.slice(offset).join(" ").trim();
        if (!query) throw new AportoConfigError("discover requires an intent");
        const result = await discoverSkills({
            appBaseUrl,
            apiKey,
            query,
            category: flagString(flags, "category"),
            capability: flagString(flags, "capability"),
            page: flagNumber(flags, "page") ?? 0,
        });
        if (asJson) printJson({ success: true, query, ...result });
        else {
            if (result.authWarning) process.stderr.write(`warning: ${result.authWarning}\n`);
            printSkills(result);
        }
        return;
    }

    if (!apiKey) {
        throw new AportoConfigError("APORTO_API_KEY is required for this command");
    }

    const client = new AportoClient({
        apiKey,
        agentName: "aporto-cli",
        appBaseUrl,
    });

    if (command === "run" || (command === "skill" && args[1] === "run")) {
        const target = args.slice(command === "skill" ? 2 : 1).join(" ").trim();
        if (!target) throw new AportoConfigError("run requires a skillId or intent");
        const numericSkillId = /^\d+$/.test(target) ? Number(target) : undefined;
        const provider = flagString(flags, "provider");
        const shouldWait = flags.wait === true;
        let result = await client.routing.runSkill({
            intent: target,
            skillId: numericSkillId,
            params: readParams(flags),
            providerHint: provider && provider !== "auto" ? provider : undefined,
            waitForResult: shouldWait,
            maxWaitSeconds: flagNumber(flags, "max-wait"),
            sessionId: flagString(flags, "session"),
        });
        if (shouldWait && result.runId && (result.status === "running" || result.status === "waiting")) {
            result = await client.routing.waitSkillRun({
                runId: result.runId,
                timeoutSeconds: flagNumber(flags, "max-wait") ?? 300,
                pollIntervalSeconds: 5,
                maxWaitSeconds: 85,
            });
        }
        if (asJson) printJson(result);
        else printRun(result);
        process.exitCode = result.status === "failed" ? 1 : 0;
        return;
    }

    if (command === "runs" && (args[1] === "get" || args[1] === "wait")) {
        const runId = args[2];
        if (!runId) throw new AportoConfigError(`runs ${args[1]} requires a runId`);
        const result = args[1] === "wait"
            ? await client.routing.waitSkillRun({
                runId,
                timeoutSeconds: flagNumber(flags, "timeout") ?? 300,
                pollIntervalSeconds: flagNumber(flags, "interval") ?? 30,
                maxWaitSeconds: flagNumber(flags, "max-wait") ?? 30,
            })
            : await client.routing.getSkillRun({
                runId,
                waitForResult: false,
                maxWaitSeconds: flagNumber(flags, "max-wait"),
            });
        if (asJson) printJson(result);
        else printRun(result);
        process.exitCode = result.status === "failed" ? 1 : 0;
        return;
    }

    throw new AportoConfigError(`Unknown command: ${args.join(" ")}`);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const showUsage = error instanceof AportoConfigError;
    process.stderr.write(showUsage ? `${message}\n\n${usage()}\n` : `${message}\n`);
    process.exit(1);
});
