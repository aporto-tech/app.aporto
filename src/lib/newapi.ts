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
 * Create a user in New-API using the admin endpoint.
 * This bypasses public registration restrictions and works regardless of
 * the "Enable password registration" setting in New-API's admin panel.
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
        // Use the admin endpoint (POST /api/user/) instead of the public /api/user/register.
        // This avoids registration restrictions (username length, password complexity, public reg toggle).
        const res = await fetch(`${cfg.url}/api/user/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${cfg.token}`,
                "New-Api-User": "1",
            },
            body: JSON.stringify({
                username: opts.username,
                password: opts.password,
                display_name: opts.username,
                email: opts.email,
                role: 1,    // common user
                status: 1,  // enabled
            }),
        });

        const data = await res.json() as { success: boolean; message?: string; data?: NewApiUser };

        if (!data.success) {
            console.warn("[newapi] User creation failed:", data.message);
            return null;
        }

        // The admin endpoint also doesn't return the user object with ID in data,
        // so we search by username to get the assigned ID.
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
 * Fetch logs for a specific user with optional filters.
 * We query Prisma directly because New-API prevents Admins from fetching other users' logs via API.
 */
export async function newApiGetLogs(opts: {
    userId: number;
    page: number;
    size: number;
    model_name?: string;
    token_name?: string;
    log_type?: string; 
    start_date?: number; // timestamp in seconds
    end_date?: number;   // timestamp in seconds
}): Promise<{ logs: any[]; total: number }> {
    try {
        const offset = opts.page * opts.size;
        
        let whereClause = `WHERE user_id = $1 AND type IN (1, 2)`;
        const params: any[] = [opts.userId];
        let pCount = 1;

        if (opts.model_name && opts.model_name !== "All Models") {
            pCount++;
            whereClause += ` AND model_name = $${pCount}`;
            params.push(opts.model_name);
        }
        if (opts.token_name && opts.token_name !== "All Agents") {
            pCount++;
            whereClause += ` AND token_name = $${pCount}`;
            params.push(opts.token_name);
        }
        if (opts.log_type && opts.log_type !== "All Types") {
            if (opts.log_type === "Consume") {
                whereClause += ` AND type = 2 AND (content = '' OR content IS NULL)`;
            } else if (opts.log_type === "Error") {
                whereClause += ` AND type = 2 AND content != '' AND content IS NOT NULL`;
            } else if (opts.log_type === "Top-up") {
                whereClause += ` AND type = 1`;
            }
        }
        if (opts.start_date) {
            pCount++;
            whereClause += ` AND created_at >= $${pCount}`;
            params.push(opts.start_date);
        }
        if (opts.end_date) {
            pCount++;
            whereClause += ` AND created_at <= $${pCount}`;
            params.push(opts.end_date);
        }

        const totalResult = await prisma.$queryRawUnsafe<any[]>(
            `SELECT COUNT(*) as count FROM logs ${whereClause}`,
            ...params
        );
        const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

        const logsResult = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, type, created_at, content, model_name, quota, prompt_tokens, completion_tokens, token_name
             FROM logs
             ${whereClause}
             ORDER BY id DESC
             LIMIT $${pCount + 1} OFFSET $${pCount + 2}`,
            ...params,
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
            token_name: l.token_name || "",
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
 * Fetch unique filter options (models and token names) for a user.
 */
export async function newApiGetFilterOptions(userId: number) {
    try {
        const models = await prisma.$queryRawUnsafe<any[]>(
            `SELECT DISTINCT model_name FROM logs WHERE user_id = $1 AND model_name != '' AND model_name IS NOT NULL`,
            userId
        );
        const tokens = await prisma.$queryRawUnsafe<any[]>(
            `SELECT DISTINCT token_name FROM logs WHERE user_id = $1 AND token_name != '' AND token_name IS NOT NULL`,
            userId
        );

        return {
            models: models.map(m => m.model_name),
            tokens: tokens.map(t => t.token_name)
        };
    } catch (err) {
        console.error("[newapi] Error fetching filter options:", err);
        return { models: [], tokens: [] };
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
 * Aggregate daily API spending for a user from the New-API logs table.
 * Excludes today (data for today is partial and excluded by design).
 * Returns last 60 days with non-zero spend, newest first.
 */
export async function newApiGetDailySpend(userId: number): Promise<{ date: string; spentUSD: number }[]> {
    try {
        const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT
                to_char(date_trunc('day', to_timestamp(created_at)), 'YYYY-MM-DD') AS date,
                SUM(quota) AS total_quota
             FROM logs
             WHERE user_id = $1
               AND type = 2
               AND (content = '' OR content IS NULL)
               AND created_at < EXTRACT(EPOCH FROM date_trunc('day', NOW()))
             GROUP BY date_trunc('day', to_timestamp(created_at))
             ORDER BY date_trunc('day', to_timestamp(created_at)) DESC
             LIMIT 60`,
            userId
        );

        const QUOTA_PER_DOLLAR = 500_000;
        return rows.map(r => ({
            date: r.date,
            spentUSD: Number(r.total_quota) / QUOTA_PER_DOLLAR,
        }));
    } catch (err) {
        console.error("[newapi] Error fetching daily spend:", err);
        return [];
    }
}
/**
 * Set allowed models on a token.
 * models="" clears restriction (sets model_limits_enabled=false).
 * The New-API schema uses model_limits (comma-separated) + model_limits_enabled (boolean).
 */
export async function newApiSetTokenModels(tokenId: number, userId: number, models: string): Promise<boolean> {
    try {
        const enabled = models.length > 0;
        const count = await prisma.$executeRawUnsafe(
            `UPDATE tokens SET model_limits = $1, model_limits_enabled = $2 WHERE id = $3 AND user_id = $4`,
            models,
            enabled,
            tokenId,
            userId
        );
        return count > 0;
    } catch (err) {
        console.error("[newapi] Error setting token models:", err);
        return false;
    }
}

/**
 * Enable (status=1) or disable (status=0) a token.
 */
export async function newApiSetTokenStatus(tokenId: number, userId: number, status: 0 | 1): Promise<boolean> {
    try {
        const count = await prisma.$executeRawUnsafe(
            `UPDATE tokens SET status = $1 WHERE id = $2 AND user_id = $3`,
            status,
            tokenId,
            userId
        );
        return count > 0;
    } catch (err) {
        console.error("[newapi] Error setting token status:", err);
        return false;
    }
}

/**
 * Get today's USD spend for a specific token (by token_id in logs).
 * "Today" = since midnight UTC.
 */
export async function newApiGetTodayTokenSpend(tokenId: number): Promise<number> {
    try {
        const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT COALESCE(SUM(quota), 0) AS total_quota
             FROM logs
             WHERE token_id = $1
               AND type = 2
               AND (content = '' OR content IS NULL)
               AND created_at >= EXTRACT(EPOCH FROM date_trunc('day', NOW()))`,
            tokenId
        );
        return Number(rows[0]?.total_quota ?? 0) / 500_000;
    } catch (err) {
        console.error("[newapi] Error getting today token spend:", err);
        return 0;
    }
}

/**
 * Get all-time USD spend for a specific token (no date filter).
 */
export async function newApiGetTotalTokenSpend(tokenId: number): Promise<number> {
    try {
        const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT COALESCE(SUM(quota), 0) AS total_quota
             FROM logs
             WHERE token_id = $1
               AND type = 2
               AND (content = '' OR content IS NULL)`,
            tokenId
        );
        return Number(rows[0]?.total_quota ?? 0) / 500_000;
    } catch (err) {
        console.error("[newapi] Error getting total token spend:", err);
        return 0;
    }
}

/**
 * Get total USD spend for a user over the last 7 days.
 */
export async function newApiGetWeeklySpend(userId: number): Promise<number> {
    try {
        const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
        const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT COALESCE(SUM(quota), 0) AS total_quota
             FROM logs
             WHERE user_id = $1
               AND type = 2
               AND (content = '' OR content IS NULL)
               AND created_at >= $2`,
            userId,
            sevenDaysAgo
        );
        return Number(rows[0]?.total_quota ?? 0) / 500_000;
    } catch (err) {
        console.error("[newapi] Error getting weekly spend:", err);
        return 0;
    }
}

/**
 * Get per-agent (token) USD spend for a user over the last 7 days.
 * Returns array sorted by spend descending.
 */
export async function newApiGetWeeklyAgentSpend(userId: number): Promise<{ tokenName: string; usdAmount: number }[]> {
    try {
        const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
        const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT token_name, COALESCE(SUM(quota), 0) AS total_quota
             FROM logs
             WHERE user_id = $1
               AND type = 2
               AND (content = '' OR content IS NULL)
               AND created_at >= $2
               AND token_name IS NOT NULL AND token_name != ''
             GROUP BY token_name
             ORDER BY total_quota DESC`,
            userId,
            sevenDaysAgo
        );
        return rows.map(r => ({
            tokenName: r.token_name,
            usdAmount: Number(r.total_quota) / 500_000,
        }));
    } catch (err) {
        console.error("[newapi] Error getting weekly agent spend:", err);
        return [];
    }
}

/**
 * Get the most-used model for a user over the last 7 days.
 */
export async function newApiGetTopModelThisWeek(userId: number): Promise<string> {
    try {
        const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
        const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT model_name, COUNT(*) AS cnt
             FROM logs
             WHERE user_id = $1
               AND type = 2
               AND model_name IS NOT NULL AND model_name != ''
               AND created_at >= $2
             GROUP BY model_name
             ORDER BY cnt DESC
             LIMIT 1`,
            userId,
            sevenDaysAgo
        );
        return rows[0]?.model_name ?? "—";
    } catch (err) {
        console.error("[newapi] Error getting top model:", err);
        return "—";
    }
}

/**
 * Grant a one-time welcome bonus to a newly registered user.
 * $3 = 1,500,000 quota units (quota / 500,000 = USD shown in balance).
 */
export async function newApiGrantWelcomeBonus(newApiUserId: number): Promise<boolean> {
    const cfg = getConfig();
    if (!cfg) {
        console.warn("[newapi] NEWAPI_URL or NEWAPI_ADMIN_TOKEN not configured — skipping welcome bonus");
        return false;
    }

    const WELCOME_BONUS_QUOTA = 3 * 500_000; // $3 displayed balance

    try {
        const userRes = await fetch(`${cfg.url}/api/user/${newApiUserId}`, {
            headers: {
                Authorization: `Bearer ${cfg.token}`,
                "New-Api-User": "1",
            },
            cache: "no-store",
        });

        if (!userRes.ok) {
            console.error(`[newapi] Failed to fetch user ${newApiUserId} for welcome bonus: ${userRes.status}`);
            return false;
        }

        const userData = await userRes.json() as { success: boolean; data?: Record<string, unknown> };
        const user = userData.data;
        if (!user) return false;

        const newQuota = ((user.quota as number) ?? 0) + WELCOME_BONUS_QUOTA;

        const updateRes = await fetch(`${cfg.url}/api/user/`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${cfg.token}`,
                "New-Api-User": "1",
            },
            body: JSON.stringify({ ...user, quota: newQuota }),
        });

        const updateData = await updateRes.json() as { success: boolean; message?: string };
        if (!updateData.success) {
            console.error(`[newapi] Welcome bonus update rejected: ${updateData.message}`);
        }
        return updateData.success ?? false;
    } catch (err) {
        console.error("[newapi] Error granting welcome bonus:", err);
        return false;
    }
}

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
