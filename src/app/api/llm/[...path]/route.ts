import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession } from "@/lib/serviceProxy";
import { extractRepoIntegrationId } from "@/lib/repoIntegrations";

export const dynamic = "force-dynamic";

const STRIP_HEADERS = new Set([
    "x-aporto-integration-id",
    "x-aporto-repo",
    "x-aporto-referral",
    "x-aporto-publisher-id",
    "x-agent-name",
]);

function upstreamBaseUrl() {
    return (process.env.NEWAPI_URL ?? "https://api.aporto.tech").replace(/\/$/, "");
}

function buildForwardHeaders(req: NextRequest): Headers {
    const headers = new Headers();
    const auth = req.headers.get("authorization");
    const contentType = req.headers.get("content-type");
    const accept = req.headers.get("accept");

    if (auth) headers.set("Authorization", auth);
    if (contentType) headers.set("Content-Type", contentType);
    if (accept) headers.set("Accept", accept);

    return headers;
}

async function proxy(req: NextRequest, params: Promise<{ path?: string[] }>) {
    const auth = await validateApiKeyOrSession(req);
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const integrationPublicId = extractRepoIntegrationId(req);
    const path = (await params).path ?? [];
    const upstreamUrl = new URL(`${upstreamBaseUrl()}/${path.map(encodeURIComponent).join("/")}`);
    upstreamUrl.search = req.nextUrl.search;
    upstreamUrl.searchParams.delete("integration_id");
    upstreamUrl.searchParams.delete("aporto_integration_id");

    const headers = buildForwardHeaders(req);
    for (const name of STRIP_HEADERS) headers.delete(name);

    const method = req.method.toUpperCase();
    const body = method === "GET" || method === "HEAD"
        ? undefined
        : await req.arrayBuffer();

    const upstream = await fetch(upstreamUrl, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(600_000),
    });

    // The integration id is intentionally consumed only inside Aporto. Revenue
    // reconciliation is handled from NewAPI/gateway logs in a follow-up writer.
    void integrationPublicId;

    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("Content-Type", contentType);

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
    return proxy(req, params);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
    return proxy(req, params);
}

export async function OPTIONS() {
    return new Response(null, { status: 204 });
}
