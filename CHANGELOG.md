# Changelog

## [0.1.0.0] - 2026-04-18

### Added
- **Transactional email notifications.** Users now receive emails for 4 lifecycle events:
  - **Welcome email** — sent after successful email verification + New-API account creation. Confirms the $3 free credit and links to dashboard.
  - **Top-up confirmation** — sent after a Stripe or NOWPayments webhook credits quota. Shows amount paid, API credit at 30% discount, and quota units added.
  - **Governance/spending alerts** — 80% and 100% spending-limit emails now use shared templates from `src/lib/emails.ts` instead of inline HTML per-file.
  - **Insufficient balance alert** — fires on the first 402 response per user per 24 hours. Includes current balance and a deep link to the top-up modal (`/dashboard?topup=1`).
- **`X-Aporto-Balance-Low: true` response header** on all 402 quota responses, enabling agents and clients to detect and handle empty balance programmatically.
- **`src/lib/emails.ts`** — central email module with `sendWelcomeEmail`, `sendTopUpConfirmationEmail`, `sendGovernanceAlertEmail`, `sendInsufficientBalanceEmail`.

### Changed
- `spending-alerts.ts` — `sendAlertEmail()` now delegates to `sendGovernanceAlertEmail()` from `emails.ts`. No behavioral change — same HTML output, single source of truth.

### Security
- HTML entity escaping applied to user-controlled strings (`agentName`, `serviceName`, user `name`) in all email templates, preventing malformed HTML if names contain `<`, `>`, or `&`.

### Infrastructure
- `User` model gains `lastInsufficientBalanceEmailAt DateTime?` for atomic 24h rate-limiting of insufficient-balance emails. Column added via SQL migration `20260418000000_add_balance_email_timestamp`.
