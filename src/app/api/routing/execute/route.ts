import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession } from "@/lib/serviceProxy";
import { selectProvider, executeSkillViaProvider, updateProviderStats, recordSkillCall } from "@/lib/routing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const auth = await validateApiKeyOrSession(req);
    if (!auth) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { skillId, params = {}, sessionId } = body;

    if (!skillId || typeof skillId !== "number") {
        return NextResponse.json({ success: false, message: "Missing required field: skillId (number)" }, { status: 400 });
    }

    const resolvedSessionId = sessionId ?? `rest-${auth.newApiUserId}-${Date.now()}`;
    const authHeader = req.headers.get("authorization") ?? "";

    try {
        const provider = await selectProvider(skillId, resolvedSessionId, auth.newApiUserId);
        if (!provider) {
            return NextResponse.json({ success: false, message: "No active providers for this skill" }, { status: 503 });
        }

        const { success, data, latencyMs } = await executeSkillViaProvider(provider, params, authHeader);

        void recordSkillCall({
            sessionId: resolvedSessionId,
            newApiUserId: auth.newApiUserId,
            skillId,
            providerId: provider.id,
            latencyMs,
            success,
            costUSD: provider.pricePerCall,
        }).catch((e) => console.error("[routing/execute] recordSkillCall:", e));

        void updateProviderStats(provider.id, latencyMs, success)
            .catch((e) => console.error("[routing/execute] updateProviderStats:", e));

        return NextResponse.json({
            success,
            provider: provider.name,
            latencyMs,
            costUSD: provider.pricePerCall,
            result: data,
        }, { status: success ? 200 : 502 });
    } catch (err) {
        console.error("[routing/execute] error:", err);
        return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
    }
}
