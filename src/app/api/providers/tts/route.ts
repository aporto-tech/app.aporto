/**
 * Provider wrapper: Text-to-Speech (ElevenLabs)
 * Note: /api/services/tts returns audio/mpeg, not JSON.
 * The routing layer receives raw audio bytes — callers must handle accordingly.
 */
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const authHeader = req.headers.get("authorization") ?? "";

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://app.aporto.tech";
    return fetch(`${baseUrl}/api/services/tts`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
        },
        body: JSON.stringify(body),
    });
}
