import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { newApiListTokens, newApiDeleteToken, newApiUpdateTokenQuota, newApiSetTokenStatus } from "@/lib/newapi";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).newApiUserId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const tokens = await newApiListTokens(Number((session.user as any).newApiUserId));
    return NextResponse.json({ success: true, tokens });
}

export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).newApiUserId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { tokenId } = await req.json();
    if (!tokenId) {
        return NextResponse.json({ success: false, message: "Missing tokenId" }, { status: 400 });
    }

    const success = await newApiDeleteToken(tokenId, Number((session.user as any).newApiUserId));
    return NextResponse.json({ success });
}

export async function PATCH(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).newApiUserId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const userId = Number((session.user as any).newApiUserId);
    const body = await req.json();
    const { tokenId, name, remain_quota, unlimited_quota, status } = body;

    if (tokenId === undefined) {
        return NextResponse.json({ success: false, message: "Missing tokenId" }, { status: 400 });
    }

    // Status-only toggle
    if (status !== undefined && name === undefined) {
        const success = await newApiSetTokenStatus(tokenId, userId, status as 0 | 1);
        return NextResponse.json({ success });
    }

    const success = await newApiUpdateTokenQuota({
        tokenId,
        userId,
        name,
        remain_quota,
        unlimited_quota
    });

    return NextResponse.json({ success });
}
