import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const ADMIN_EMAILS = new Set(["pevzner@aporto.tech", "it@aporto.tech"]);

/**
 * Returns true if the current NextAuth session belongs to an admin.
 * Usage: const admin = await isAdmin(); if (!admin) return 403;
 */
export async function isAdmin(): Promise<boolean> {
    const session = await getServerSession(authOptions);
    return ADMIN_EMAILS.has((session?.user as any)?.email ?? "");
}
