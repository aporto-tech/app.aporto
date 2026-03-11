/**
 * New-API helper utilities
 *
 * Provides functions for creating users and tokens in the New-API instance.
 * The New-API instance is identified by NEWAPI_URL and authenticated with NEWAPI_ADMIN_TOKEN.
 *
 * New-API is an OpenAI-compatible middleware (https://github.com/Calcium-Ion/new-api).
 * It manages users, API tokens (keys), and LLM channel routing.
 */

import { prisma } from "@/lib/prisma";

interface NewApiUser {
    id: number;
    username: string;
    email: string;
}

interface NewApiToken {
    id: number;
    key: string;
    name: string;
    status: number;
    created_time: number;
    accessed_time: number;
    expired_time: number;
    remain_quota: number;
    unlimited_quota: boolean;
}

function getConfig() {
    const url = process.env.NEWAPI_URL;
    const token = process.env.NEWAPI_ADMIN_TOKEN;
    if (!url || !token || token === "changeme_after_first_boot") {
        return null;
    }
    return { url, token };
}

/**
 * Create a user in New-API.
 * Called on registration so the aporto user has a corresponding New-API account.
 */
export async function newApiCreateUser(opts: {
    username: string;
    email: string;
    password: string;
}): Promise<NewApiUser | null> {
    const cfg = getConfig();
    if (!cfg) {
        console.warn("[newapi] NEWAPI_URL or NEWAPI_ADMIN_TOKEN not configured — skipping user creation");
        return null;
    }

    try {
        const res = await fetch(`${cfg.url}/api/user/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${cfg.token}`,
                "New-Api-User": "1", // Needed if using a console access_token instead of an sk- key
            },
            body: JSON.stringify({
                username: opts.username,
                password: opts.password,
                password2: opts.password,
                email: opts.email,
            }),
        });

        const data = await res.json() as { success: boolean; message?: string; data?: NewApiUser };

        if (!data.success) {
            console.warn("[newapi] User creation failed:", data.message);
            return null;
        }

        // New-API's register endpoint doesn't return the created user object in `data`.
        // We must fetch the user list filtering by username to get the assigned ID.
        const listRes = await fetch(`${cfg.url}/api/user/?keyword=${opts.username}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${cfg.token}`,
                "New-Api-User": "1",
            },
        });

        const listData = await listRes.json() as { success: boolean; data?: { items: NewApiUser[] } };

        if (listData.success && listData.data?.items) {
            const createdUser = listData.data.items.find(u => u.username === opts.username);
            if (createdUser) {
                return createdUser;
            }
        }

        console.warn("[newapi] User created but could not retrieve their generated ID.");
        return data.data ?? null;
    } catch (err) {
        console.error("[newapi] Error creating user:", err);
        return null;
    }
}

/**
 * Create an API token (key) for a user in New-API.
 * Called when a user clicks "Create API Key" on the dashboard.
 */
export async function newApiCreateToken(opts: {
    name: string;
    userId?: number;
}): Promise<NewApiToken | null> {
    const cfg = getConfig();
    if (!cfg) {
        console.warn("[newapi] NEWAPI_URL or NEWAPI_ADMIN_TOKEN not configured — skipping token creation");
        return null;
    }

    try {
        const res = await fetch(`${cfg.url}/api/token/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${cfg.token}`,
                // We MUST create this as the Admin user (1) initially, because New-API 
                // rejects the request if New-Api-User does not match the token's owner ID.
                "New-Api-User": "1",
            },
            body: JSON.stringify({
                name: opts.name,
                expired_time: -1,
                remain_quota: 0,
                unlimited_quota: true,
            }),
        });

        const data = await res.json() as { success: boolean; message?: string; data?: NewApiToken };

        if (!data.success) {
            console.warn("[newapi] Token creation failed:", data.message);
            return null;
        }

        // New-API does NOT return the key string in the POST response.
        // We must fetch the tokens list and find the one we just created.
        // Because of the New-API delegation bug, the token is temporarily owned by Admin (1).
        const listRes = await fetch(`${cfg.url}/api/token/?p=0&size=100`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${cfg.token}`,
                "New-Api-User": "1", // Always fetch from admin's list where it was mistakenly created
            },
        });

        const listData = await listRes.json() as { success: boolean; data?: { items: NewApiToken[] } };

        if (listData.success && listData.data?.items) {
            // Find the most recently created token that matches the name
            const createdToken = listData.data.items.find((t) => t.name === opts.name);
            if (createdToken) {
                try {
                    if (opts.userId) {
                        await prisma.$executeRawUnsafe('UPDATE "tokens" SET "user_id" = $1 WHERE "id" = $2', opts.userId, createdToken.id);
                    }
                    // Fetch the REAL key from Database (New-API GET /api/token masks it)
                    const rawToken = await prisma.$queryRawUnsafe<any[]>('SELECT key FROM tokens WHERE id = $1', createdToken.id);
                    if (rawToken && rawToken.length > 0) {
                        createdToken.key = rawToken[0].key;
                    }
                } catch (e) {
                    console.error("[newapi] Failed to update/fetch token ownership via Prisma:", e);
                }
                return createdToken;
            }
        }

        console.warn("[newapi] Token created but could not retrieve key string.");
        return data.data ?? null;
    } catch (err) {
        console.error("[newapi] Error creating token:", err);
        return null;
    }
}

/**
 * Change a user's password in New-API (called on password reset).
 * Requires admin token.
 */
export async function newApiUpdatePassword(opts: {
    userId: number;
    newPassword: string;
}): Promise<boolean> {
    const cfg = getConfig();
    if (!cfg) return false;

    try {
        const res = await fetch(`${cfg.url}/api/user/manage`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${cfg.token}`,
                "New-Api-User": "1",
            },
            body: JSON.stringify({
                id: opts.userId,
                password: opts.newPassword,
            }),
        });

        const data = await res.json() as { success: boolean };
        return data.success ?? false;
    } catch (err) {
        console.error("[newapi] Error updating password:", err);
        return false;
    }
}

/**
 * List all tokens for a specific user.
 * We query Prisma directly because New-API strictly prevents Admins from fetching other users' tokens via API.
 */
export async function newApiListTokens(userId: number): Promise<NewApiToken[]> {
    try {
        const tokens = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, key, name, status, created_time, accessed_time, expired_time, remain_quota, unlimited_quota 
             FROM tokens 
             WHERE user_id = $1 AND deleted_at IS NULL 
             ORDER BY created_time DESC`,
            userId
        );

        // Prisma returns BigInt for Postgres bigints, convert them to standard numbers to match Next.js serialization
        return tokens.map(t => ({
            id: Number(t.id),
            key: t.key?.trim() || "",
            name: t.name,
            status: Number(t.status),
            created_time: Number(t.created_time),
            accessed_time: Number(t.accessed_time),
            expired_time: Number(t.expired_time),
            remain_quota: Number(t.remain_quota),
            unlimited_quota: Boolean(t.unlimited_quota)
        }));
    } catch (err) {
        console.error("[newapi] Error listing tokens via Prisma:", err);
        return [];
    }
}

/**
 * Fetch logs for a specific user.
 * We query Prisma directly because New-API prevents Admins from fetching other users' logs via API.
 */
export async function newApiGetLogs(opts: {
    userId: number;
    page: number;
    size: number;
}): Promise<{ logs: any[]; total: number }> {
    try {
        const offset = opts.page * opts.size;
        
        // Ensure standard numbers
        const totalResult = await prisma.$queryRawUnsafe<any[]>(
            `SELECT COUNT(*) as count FROM logs WHERE user_id = $1`,
            opts.userId
        );
        const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

        const logsResult = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, type, created_at, content, model_name, quota, prompt_tokens, completion_tokens
             FROM logs
             WHERE user_id = $1
             ORDER BY id DESC
             LIMIT $2 OFFSET $3`,
            opts.userId,
            opts.size,
            offset
        );

        // Convert Prisma BigInts and properly map the columns
        const formattedLogs = logsResult.map(l => ({
            id: Number(l.id),
            type: Number(l.type),
            created_at: Number(l.created_at),
            content: l.content || "",
            model_name: l.model_name || "",
            quota: Number(l.quota || 0),
            prompt_tokens: Number(l.prompt_tokens || 0),
            completion_tokens: Number(l.completion_tokens || 0)
        }));

        return { logs: formattedLogs, total };
    } catch (err) {
        console.error("[newapi] Error fetching logs via Prisma:", err);
        return { logs: [], total: 0 };
    }
}

/**
 * Delete a specific token.
 */
export async function newApiDeleteToken(tokenId: number, userId: number): Promise<boolean> {
    try {
        // New-API uses soft deletes
        const count = await prisma.$executeRawUnsafe(
            `UPDATE tokens SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`,
            tokenId,
            userId
        );
        return count > 0;
    } catch (err) {
        console.error("[newapi] Error deleting token via Prisma:", err);
        return false;
    }
}

/**
 * Update a token's quota.
 */
export async function newApiUpdateTokenQuota(opts: {
    tokenId: number;
    userId: number;
    name: string;
    remain_quota: number;
    unlimited_quota: boolean;
}): Promise<boolean> {
    try {
        const count = await prisma.$executeRawUnsafe(
            `UPDATE tokens 
             SET name = $1, remain_quota = $2, unlimited_quota = $3 
             WHERE id = $4 AND user_id = $5`,
            opts.name,
            opts.remain_quota,
            opts.unlimited_quota,
            opts.tokenId,
            opts.userId
        );
        return count > 0;
    } catch (err) {
        console.error("[newapi] Error updating token quota via Prisma:", err);
        return false;
    }
}
