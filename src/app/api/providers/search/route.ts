/**
 * Provider wrapper: Web Search (Linkup)
 * Called internally by execute_skill routing via the caller's auth header.
 * Delegates to /api/services/search — same auth, same billing.
 */
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const authHeader = req.headers.get("authorization") ?? "";

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://app.aporto.tech";
    return fetch(`${baseUrl}/api/services/search`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
        },
        body: JSON.stringify(body),
    });
}
