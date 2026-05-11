const DEFAULT_BASE_URL = process.env.APORTO_INTERNAL_BASE_URL ?? "http://127.0.0.1:3000";
const BASE_URL = process.env.APORTO_POLLER_BASE_URL ?? DEFAULT_BASE_URL;
const CRON_SECRET = process.env.CRON_SECRET;

const INTERVAL_MS = positiveInt(process.env.APORTO_SKILL_POLLER_INTERVAL_MS, 30_000);
const LIMIT = positiveInt(process.env.APORTO_SKILL_POLLER_LIMIT, 20);
const MAX_WAIT_SECONDS_PER_RUN = positiveInt(process.env.APORTO_SKILL_POLLER_WAIT_SECONDS, 5);

let stopping = false;

function positiveInt(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pollUrl() {
    const url = new URL("/api/cron/skill-runs/poll", BASE_URL);
    url.searchParams.set("limit", String(LIMIT));
    url.searchParams.set("maxWaitSecondsPerRun", String(MAX_WAIT_SECONDS_PER_RUN));
    return url;
}

async function tick() {
    if (!CRON_SECRET) {
        throw new Error("CRON_SECRET is required");
    }

    const startedAt = Date.now();
    const res = await fetch(pollUrl(), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${CRON_SECRET}`,
        },
        signal: AbortSignal.timeout(Math.max(10_000, MAX_WAIT_SECONDS_PER_RUN * LIMIT * 1000 + 10_000)),
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }

    const durationMs = Date.now() - startedAt;
    if (!res.ok) {
        console.error("[skill-runs-poller] poll failed", {
            status: res.status,
            durationMs,
            data,
        });
        return;
    }

    console.log("[skill-runs-poller] poll complete", {
        durationMs,
        checked: data.checked ?? 0,
        succeeded: data.succeeded ?? 0,
        failed: data.failed ?? 0,
        running: data.running ?? 0,
        errors: Array.isArray(data.errors) ? data.errors.length : 0,
    });
}

async function main() {
    console.log("[skill-runs-poller] started", {
        baseUrl: BASE_URL,
        intervalMs: INTERVAL_MS,
        limit: LIMIT,
        maxWaitSecondsPerRun: MAX_WAIT_SECONDS_PER_RUN,
    });

    while (!stopping) {
        try {
            await tick();
        } catch (error) {
            console.error("[skill-runs-poller] tick error", error);
        }
        if (!stopping) await sleep(INTERVAL_MS);
    }

    console.log("[skill-runs-poller] stopped");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        stopping = true;
    });
}

main().catch((error) => {
    console.error("[skill-runs-poller] fatal", error);
    process.exit(1);
});
