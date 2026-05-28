import { trackServerEvent } from "@/lib/mixpanel-server";

/**
 * Telegram bot Mixpanel events.
 * All events are prefixed with `tg_` for easy filtering in Mixpanel dashboards.
 * distinct_id: `tg:{telegramUserId}` — consistent across all telegram events.
 * For linked users, `aporto_user_id` is included as a property so sessions
 * can be joined with web events.
 */

function tgId(telegramUserId: string): string {
    return `tg:${telegramUserId}`;
}

/** User sent a message — captures the discovery/planning phase */
export function trackTgMessage(params: {
    telegramUserId: string;
    accountType: "linked" | "trial";
    aportoUserId?: string | null;
    query: string;
    hasAttachments: boolean;
    candidatesCount: number;
    topSkillId: number | null;
    topSimilarity: number | null;
    planAction: string;
    planConfidence: number | null;
    selectedSkillId: number | null;
    latencyMs: number;
}): void {
    trackServerEvent(tgId(params.telegramUserId), "tg_message", {
        account_type: params.accountType,
        telegram_user_id: params.telegramUserId,
        ...(params.aportoUserId ? { aporto_user_id: params.aportoUserId } : {}),
        query: params.query.slice(0, 200),
        has_attachments: params.hasAttachments,
        candidates_count: params.candidatesCount,
        top_skill_id: params.topSkillId,
        top_similarity: params.topSimilarity,
        plan_action: params.planAction,
        plan_confidence: params.planConfidence,
        selected_skill_id: params.selectedSkillId,
        latency_ms: params.latencyMs,
    }).catch(() => {});
}

/** Skill execution was started */
export function trackTgSkillRun(params: {
    telegramUserId: string;
    accountType: "linked" | "trial";
    aportoUserId?: string | null;
    skillId: number | null;
    intent: string;
    billingMode: "paid" | "trial";
    sessionId: string;
}): void {
    trackServerEvent(tgId(params.telegramUserId), "tg_skill_run", {
        account_type: params.accountType,
        telegram_user_id: params.telegramUserId,
        ...(params.aportoUserId ? { aporto_user_id: params.aportoUserId } : {}),
        skill_id: params.skillId,
        intent: params.intent.slice(0, 200),
        billing_mode: params.billingMode,
        session_id: params.sessionId,
    }).catch(() => {});
}

/** Skill result was delivered back to the user */
export function trackTgResultDelivered(params: {
    telegramUserId: string;
    skillId: number | null;
    status: string;
    costUsd: number | null;
    hasText: boolean;
    hasFiles: boolean;
    deliveryType: "sync" | "async";
    deliveryAttempts?: number;
}): void {
    trackServerEvent(tgId(params.telegramUserId), "tg_result_delivered", {
        telegram_user_id: params.telegramUserId,
        skill_id: params.skillId,
        status: params.status,
        cost_usd: params.costUsd,
        has_text: params.hasText,
        has_files: params.hasFiles,
        delivery_type: params.deliveryType,
        delivery_attempts: params.deliveryAttempts ?? 1,
    }).catch(() => {});
}

/** User ran a slash command */
export function trackTgCommand(params: {
    telegramUserId: string;
    accountType: "linked" | "trial";
    aportoUserId?: string | null;
    command: string;
}): void {
    trackServerEvent(tgId(params.telegramUserId), "tg_command", {
        account_type: params.accountType,
        telegram_user_id: params.telegramUserId,
        ...(params.aportoUserId ? { aporto_user_id: params.aportoUserId } : {}),
        command: params.command,
    }).catch(() => {});
}

/** User successfully linked Telegram to an Aporto account */
export function trackTgAccountLinked(params: {
    telegramUserId: string;
    aportoUserId?: string | null;
    linkedEmail?: string | null;
}): void {
    trackServerEvent(tgId(params.telegramUserId), "tg_account_linked", {
        account_type: "linked",
        telegram_user_id: params.telegramUserId,
        ...(params.aportoUserId ? { aporto_user_id: params.aportoUserId } : {}),
        linked_email: params.linkedEmail ?? null,
    }).catch(() => {});
}

/** User unlinked Telegram from their Aporto account */
export function trackTgAccountUnlinked(params: {
    telegramUserId: string;
    aportoUserId?: string | null;
}): void {
    trackServerEvent(tgId(params.telegramUserId), "tg_account_unlinked", {
        account_type: "trial",
        telegram_user_id: params.telegramUserId,
        ...(params.aportoUserId ? { aporto_user_id: params.aportoUserId } : {}),
    }).catch(() => {});
}

/** Trial limit reached — skill execution was blocked */
export function trackTgTrialBlocked(params: {
    telegramUserId: string;
    skillId: number | null;
}): void {
    trackServerEvent(tgId(params.telegramUserId), "tg_trial_blocked", {
        account_type: "trial",
        telegram_user_id: params.telegramUserId,
        skill_id: params.skillId,
    }).catch(() => {});
}
