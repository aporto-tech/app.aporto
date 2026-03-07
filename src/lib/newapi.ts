/**
 * New-API helper utilities
 *
 * Provides functions for creating users and tokens in the New-API instance.
 * The New-API instance is identified by NEWAPI_URL and authenticated with NEWAPI_ADMIN_TOKEN.
 *
 * New-API is an OpenAI-compatible middleware (https://github.com/Calcium-Ion/new-api).
 * It manages users, API tokens (keys), and LLM channel routing.
 */

interface NewApiUser {
    id: number;
    username: string;
    email: string;
}

interface NewApiToken {
    id: number;
    key: string;
    name: string;
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
                "New-Api-User": opts.userId ? String(opts.userId) : "1",
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
        const listRes = await fetch(`${cfg.url}/api/token/?p=0&size=10`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${cfg.token}`,
                "New-Api-User": opts.userId ? String(opts.userId) : "1",
            },
        });

        const listData = await listRes.json() as { success: boolean; data?: { items: NewApiToken[] } };

        if (listData.success && listData.data?.items) {
            // Find the most recently created token that matches the name
            const createdToken = listData.data.items.find((t) => t.name === opts.name);
            if (createdToken) {
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
