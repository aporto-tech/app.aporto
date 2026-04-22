/**
 * Provider wrapper: AI Search (You.com)
 */
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const authHeader = req.headers.get("authorization") ?? "";

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://app.aporto.tech";
    return fetch(`${baseUrl}/api/services/ai-search`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
        },
        body: JSON.stringify(body),
    });
}
