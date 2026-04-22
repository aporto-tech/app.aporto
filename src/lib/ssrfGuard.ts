/**
 * SSRF guard for third-party endpoint URLs.
 *
 * Validates that a URL:
 * 1. Is HTTPS (not HTTP)
 * 2. Does not point to private/loopback IPs (by regex on the URL string)
 * 3. After DNS resolution, does not resolve to a private/loopback IP (DNS rebinding protection)
 *
 * Used at: publisher provider registration, AI assistant URL fetching.
 */
import dns from "dns/promises";
import { isIP } from "net";

const BLOCKED_URL_PATTERNS = [
    /^https?:\/\/localhost/i,
    /^https?:\/\/127\./,
    /^https?:\/\/0\./,
    /^https?:\/\/10\./,
    /^https?:\/\/172\.(1[6-9]|2[0-9]|3[01])\./,
    /^https?:\/\/192\.168\./,
    /^https?:\/\/169\.254\./,      // link-local / cloud metadata
    /^https?:\/\/\[::1\]/,         // IPv6 loopback
    /^https?:\/\/\[::ffff:/i,      // IPv4-mapped IPv6
    /^https?:\/\/\[fc[0-9a-f]{2}/i, // ULA fc00::/7
    /^https?:\/\/\[fd[0-9a-f]{2}/i, // ULA fd00::/8
    /^https?:\/\/\[fe80:/i,        // link-local IPv6
    /metadata\.google\.internal/i,
    /169\.254\.169\.254/,
    /100\.100\.100\.200/,          // Alibaba Cloud metadata
];

function isPrivateIPv4(ip: string): boolean {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) return false;
    const [a, b] = parts;
    return (
        a === 127 ||
        a === 10 ||
        a === 0 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254)
    );
}

function isPrivateIPv6(ip: string): boolean {
    const l = ip.toLowerCase();
    return (
        l === "::1" ||
        l.startsWith("fc") ||
        l.startsWith("fd") ||
        l.startsWith("fe80") ||
        l.startsWith("::ffff:")
    );
}

function isPrivateIP(ip: string): boolean {
    const version = isIP(ip);
    if (version === 4) return isPrivateIPv4(ip);
    if (version === 6) return isPrivateIPv6(ip);
    return false;
}

export interface SSRFValidationResult {
    ok: boolean;
    error?: string;
}

export async function validateEndpointUrl(url: string): Promise<SSRFValidationResult> {
    // 1. Must be parseable
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return { ok: false, error: "Invalid URL format." };
    }

    // 2. HTTPS only
    if (parsed.protocol !== "https:") {
        return { ok: false, error: "Only HTTPS endpoints are allowed." };
    }

    // 3. Regex blocklist on raw URL string
    for (const pattern of BLOCKED_URL_PATTERNS) {
        if (pattern.test(url)) {
            return { ok: false, error: "Endpoint URL is not allowed (private/reserved address)." };
        }
    }

    const hostname = parsed.hostname;

    // 4. If hostname is already a literal IP, check it directly
    const ipVersion = isIP(hostname);
    if (ipVersion !== 0) {
        if (isPrivateIP(hostname)) {
            return { ok: false, error: "Endpoint URL is not allowed (private/reserved address)." };
        }
        return { ok: true };
    }

    // 5. Hostname — resolve DNS and check all returned IPs (DNS rebinding protection)
    try {
        const addresses = await dns.lookup(hostname, { all: true });
        for (const { address } of addresses) {
            if (isPrivateIP(address)) {
                return { ok: false, error: `Endpoint hostname resolves to a private IP address (${address}).` };
            }
        }
    } catch (e) {
        return { ok: false, error: `Could not resolve endpoint hostname: ${(e as Error).message}` };
    }

    return { ok: true };
}
