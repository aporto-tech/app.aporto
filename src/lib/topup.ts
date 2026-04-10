import { prisma } from "@/lib/prisma";

const NEWAPI_ADMIN_TOKEN = process.env.NEWAPI_ADMIN_TOKEN || "";
const NEWAPI_URL = process.env.NEWAPI_URL || "https://api.aporto.tech";

// 1 USD at official API prices = 500,000 quota units in New-API.
// Aporto is 30% cheaper than official prices, so $1 deposited
// buys $1/0.70 ≈ $1.43 of official API usage.
export const QUOTA_PER_USD = 500_000;
export const APORTO_DISCOUNT = 0.7; // user pays 70% of official price

export async function topUpUserQuota(newApiUserId: number, usdAmount: number) {
    const adminHeaders = {
        "Authorization": `Bearer ${NEWAPI_ADMIN_TOKEN}`,
        "New-Api-User": "1",
    };

    // Fetch current user quota
    const userRes = await fetch(`${NEWAPI_URL}/api/user/${newApiUserId}`, {
        headers: adminHeaders,
        cache: "no-store",
    });

    if (!userRes.ok) {
        const errText = await userRes.text();
        throw new Error(`Failed to fetch user ${newApiUserId}: ${userRes.status} — ${errText}`);
    }

    const userData = await userRes.json();
    const user = userData.data;
    const currentQuota: number = user?.quota ?? 0;
    const addQuota = Math.floor((usdAmount / APORTO_DISCOUNT) * QUOTA_PER_USD);
    const newQuota = currentQuota + addQuota;

    // PUT back the full user object with only quota changed.
    // New-API does a full replace on PUT, so we must send all existing fields
    // to avoid resetting username, group, etc.
    const updateRes = await fetch(`${NEWAPI_URL}/api/user/`, {
        method: "PUT",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ...user, quota: newQuota }),
    });

    if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Failed to update quota for user ${newApiUserId}: ${errText}`);
    }

    const updateData = await updateRes.json();
    if (!updateData.success) {
        throw new Error(`New-API rejected quota update: ${updateData.message}`);
    }

    return { added: addQuota, newQuota, email: user.email ?? "" };
}

/**
 * Idempotency-safe top-up.
 *
 * Inserts the TopUpTransaction row FIRST (throws on duplicate orderId due to
 * @unique constraint), then credits quota. This prevents double-credit if:
 *   - The webhook is retried after a transient DB failure
 *   - Two webhooks for different payment providers arrive concurrently for the same user
 *
 * Returns true if quota was credited, false if orderId was already processed.
 */
export async function safeTopUp(
    orderId: string,
    newApiUserId: number,
    usdPaid: number,
    packageId?: string | null,
): Promise<boolean> {
    const creditedUSD = parseFloat((usdPaid / APORTO_DISCOUNT).toFixed(6));

    let quotaAdded = 0;
    let email = "";

    try {
        // Step 1: Try to reserve the orderId in the DB. If this throws a unique
        // constraint error, the payment was already processed — return false immediately.
        // quotaAdded defaults to 0 here; we update it after topUpUserQuota succeeds.
        const placeholder = await prisma.topUpTransaction.create({
            data: {
                newApiUserId,
                email: "",       // filled in after quota top-up
                orderId,
                usdPaid,
                creditedUSD,
                quotaAdded: 0,   // updated below
            },
        });

        // Step 2: Credit quota — now that the row is reserved, double-credit is impossible.
        const result = await topUpUserQuota(newApiUserId, usdPaid);
        quotaAdded = result.added;
        email = result.email;

        // Step 3: Update the row with the actual values.
        await prisma.topUpTransaction.update({
            where: { id: placeholder.id },
            data: { quotaAdded, email },
        });

        return true;
    } catch (err: unknown) {
        // Prisma unique constraint error codes: P2002
        const isPrismaUniqueError =
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            (err as { code: string }).code === "P2002";

        if (isPrismaUniqueError) {
            // Already processed — idempotent success
            return false;
        }

        // Real error — rethrow so the webhook returns 500 and the provider retries
        throw err;
    }
}
