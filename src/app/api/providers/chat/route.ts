/**
 * Provider wrapper: LLM Chat (Aporto gateway)
 * Forwards to the New-API gateway at NEWAPI_URL/v1/chat/completions.
 */
import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession } from "@/lib/serviceProxy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const auth = await validateApiKeyOrSession(req);
    if (!auth) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const authHeader = req.headers.get("authorization") ?? "";
    const newApiUrl = process.env.NEWAPI_URL ?? "https://api.aporto.tech";

    const res = await fetch(`${newApiUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
