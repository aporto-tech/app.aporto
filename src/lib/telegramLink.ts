import { createHash } from "crypto";

export function hashTelegramLinkCode(code: string): string {
    const salt = process.env.TELEGRAM_LINK_SECRET ?? process.env.NEXTAUTH_SECRET ?? "aporto-telegram-link";
    return createHash("sha256").update(`${salt}:${code.trim().toUpperCase()}`).digest("hex");
}
