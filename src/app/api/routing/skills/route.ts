import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession } from "@/lib/serviceProxy";
import { discoverSkills } from "@/lib/routing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const auth = await validateApiKeyOrSession(req);
    if (!auth) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { query, page = 0, category, capability } = body;

    if (!query || typeof query !== "string") {
        return NextResponse.json({ success: false, message: "Missing required field: query" }, { status: 400 });
    }

    try {
        const skills = await discoverSkills(query, page, { category, capability });
        return NextResponse.json({ success: true, skills, page });
    } catch (err) {
        console.error("[routing/skills] error:", err);
        return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
    }
}
