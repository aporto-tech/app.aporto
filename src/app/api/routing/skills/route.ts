import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession } from "@/lib/serviceProxy";
import { discoverSkills } from "@/lib/routing";
import { getRequestIp, logSkillDiscovery } from "@/lib/discoveryLogs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const auth = await validateApiKeyOrSession(req);
    if (!auth) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { query, page = 0, category, capability, sessionId } = body;

    if (!query || typeof query !== "string") {
        return NextResponse.json({ success: false, message: "Missing required field: query" }, { status: 400 });
    }

    try {
        const start = Date.now();
        const skills = await discoverSkills(query, page, { category, capability });
        void logSkillDiscovery({
            newApiUserId: auth.newApiUserId,
            tokenId: auth.tokenId,
            source: "rest",
            query,
            page,
            category,
            capability,
            sessionId,
            skills,
            latencyMs: Date.now() - start,
            userAgent: req.headers.get("user-agent"),
            ip: getRequestIp(req),
        });
        return NextResponse.json({ success: true, skills, page });
    } catch (err) {
        console.error("[routing/skills] error:", err);
        void logSkillDiscovery({
            newApiUserId: auth.newApiUserId,
            tokenId: auth.tokenId,
            source: "rest",
            query,
            page,
            category,
            capability,
            sessionId,
            error: String(err),
            userAgent: req.headers.get("user-agent"),
            ip: getRequestIp(req),
        });
        return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
    }
}
