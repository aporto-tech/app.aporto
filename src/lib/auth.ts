import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const ADMIN_EMAIL = "pevzner@aporto.tech";

/**
 * Returns true if the current NextAuth session belongs to the admin.
 * Usage: const admin = await isAdmin(); if (!admin) return 403;
 */
export async function isAdmin(): Promise<boolean> {
    const session = await getServerSession(authOptions);
    return (session?.user as any)?.email === ADMIN_EMAIL;
}
