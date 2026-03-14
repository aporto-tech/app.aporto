import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { newApiGetFilterOptions } from "@/lib/newapi";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || !(session.user as any).newApiUserId) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const newApiUserId = (session.user as any).newApiUserId;
        const options = await newApiGetFilterOptions(Number(newApiUserId));

        return NextResponse.json({
            success: true,
            ...options
        });

    } catch (error) {
        console.error("[filters] Error:", error);
        return NextResponse.json(
            { success: false, message: String(error) },
            { status: 500 }
        );
    }
}
