import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyOrSession } from "@/lib/serviceProxy";
import { createProviderAttribution } from "@/lib/providerAttribution";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const auth = await validateApiKeyOrSession(req);
    if (!auth) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const providerId = Number(body.providerId ?? body.referralProviderId);
    if (!providerId) {
        return NextResponse.json({ success: false, message: "providerId is required" }, { status: 400 });
    }

    const attribution = await createProviderAttribution({
        newApiUserId: auth.newApiUserId,
        providerId,
        source: "claim",
    });

    if (!attribution) {
        return NextResponse.json({ success: false, message: "Provider not found or inactive" }, { status: 404 });
    }

    return NextResponse.json({
        success: true,
        skillId: attribution.skillId,
        providerId,
    });
}
