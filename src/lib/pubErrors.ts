import { NextResponse } from "next/server";
import type { AuthErrorCode } from "@/lib/publisherAuth";

interface Violation {
    field: string;
    code: string;
    detail?: string;
}

export function pubError(
    code: string,
    message: string,
    status: number,
    violations?: Violation[],
): NextResponse {
    const body: Record<string, unknown> = { success: false, error: code, message };
    if (violations) body.violations = violations;
    return NextResponse.json(body, { status });
}

export function pubAuthError(errorCode: AuthErrorCode | undefined, message: string | undefined): NextResponse {
    return pubError(
        errorCode ?? "AUTH_FAILED",
        message ?? "Authentication failed.",
        401,
    );
}
