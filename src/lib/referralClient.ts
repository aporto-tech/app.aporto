const STORAGE_KEY = "aporto_referral_provider_id";
const PARAM_NAMES = ["providerId", "referralProviderId", "aportoProviderId", "aporto_provider_id"];

function normalizeProviderId(value: string | null): number | null {
    if (!value) return null;
    const providerId = Number(value);
    return Number.isInteger(providerId) && providerId > 0 ? providerId : null;
}

export function getStoredReferralProviderId(): number | null {
    if (typeof window === "undefined") return null;
    return normalizeProviderId(window.localStorage.getItem(STORAGE_KEY));
}

export function captureReferralProviderId(): number | null {
    if (typeof window === "undefined") return null;

    const params = new URLSearchParams(window.location.search);
    const providerId = PARAM_NAMES
        .map((name) => normalizeProviderId(params.get(name)))
        .find((id): id is number => id !== null);

    if (providerId) {
        window.localStorage.setItem(STORAGE_KEY, String(providerId));
        return providerId;
    }

    return getStoredReferralProviderId();
}

export function clearReferralProviderId() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
}

export function withReferralProvider(path: string): string {
    const providerId = getStoredReferralProviderId();
    if (!providerId) return path;

    const [base, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    params.set("referralProviderId", String(providerId));
    return `${base}?${params.toString()}`;
}

export async function claimStoredProviderAttribution(): Promise<boolean> {
    const providerId = getStoredReferralProviderId();
    if (!providerId) return false;

    const res = await fetch("/api/routing/provider-attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
    });

    if (res.ok) {
        clearReferralProviderId();
        return true;
    }

    if (res.status === 404) {
        clearReferralProviderId();
    }

    return false;
}
