# TODOS

Items deferred from the Email Verification + Bitrix24 + SDK plan review.

---

## T1 — Bitrix24 lead observability / retry

**What:** Add retry or dead-letter mechanism for failed Bitrix24 lead creations.

**Why:** Current design is fire-and-forget with only `console.error`. A network blip during email verification silently drops a lead — no recovery, no alerting. Lead capture at OTP confirmation is the stated business value of the Bitrix24 integration; silent failure undermines it.

**Pros:** Sales team sees all registrations in CRM. Zero lost leads.

**Cons:** Adds a `LeadFailure` DB table (1 migration) plus a cron job or Supabase scheduled function.

**Context:** After deploying Task 1, watch the server logs for `[bitrix24] lead creation failed` entries. If failures are rare (< 1%), defer. If they occur regularly (Bitrix24 rate limits, network issues), prioritize this.

**Where to start:** `src/app/api/auth/verify-email/route.ts` — the fire-and-forget call. Add a `LeadFailure` model to Prisma schema, write failures there, add a cron to retry with exponential backoff.

**Depends on:** Task 1 shipped.

---

## T2 — E2E test suite for registration flow

**What:** Add Playwright (or Cypress) with tests for the full registration flow.

**Why:** The register → OTP → verify → dashboard flow spans 3 API calls and 2 UI steps. Unit tests don't catch integration failures. The codebase currently has zero test infrastructure. The NextAuth `emailVerified === null` guard is a regression risk — without an E2E test, a future refactor could silently lock out all verified users.

**Pros:** Catches regressions in the most critical user path. Protects the New-API session setup. Gives confidence to refactor auth code.

**Cons:** Needs test DB or mocking strategy. Playwright setup: ~1 day human / ~30 min with CC.

**Context:** Priority paths to cover:
1. Happy path: register → OTP email → enter code → land on dashboard with newApiUserId in session
2. Wrong OTP: 422 error shown, form stays open
3. Expired OTP: 410 error + "request new code" prompt
4. Unverified user bypassing OTP via direct `/login`: should fail silently
5. Existing verified user login: must still work (regression)

**Where to start:** Add `playwright.config.ts` at repo root. Create `e2e/auth.spec.ts`.

**Depends on:** Task 1 shipped.

---

## T3 — SDK follow-up: broaden optional modules

**What:** Add backend routes before exposing optional SDK modules for browser, compute, messaging, and db. Keep unavailable modules explicit with `AportoNotAvailableError` until their routes are live.

**Why:** The core SDK surface now has real routes for LLM, search, image, TTS, SMS send, routing, and x402. Additional modules should not be advertised as usable until the backend contract exists.

**Pros:** Keeps the public SDK honest while leaving a clear path to broaden the platform.

**Cons:** Requires backend work before those modules can be enabled.

**Context:** Media SDK methods return stored S3/R2 artifact URLs. `sms.check` remains unavailable because there is no `/api/services/sms/check` route.

**Where to start:** Add the backend route first, then wire the matching SDK module and README example in the same change.

**Depends on:** Confirmed backend route and pricing/billing behavior.

---

## T4 — Email preferences / opt-out

**What:** Add `emailPreferences` JSON field or individual boolean flags to the User model to allow per-event-type opt-out (welcome, top-up, balance alerts, governance alerts).

**Why:** Transactional emails without an opt-out path create CAN-SPAM/GDPR exposure. Any enterprise prospect running compliance review will flag this. The current plan sends emails with no opt-out mechanism.

**Where to start:** Add `emailOptOut Boolean @default(false)` or `emailPreferences Json?` to `prisma/schema.prisma`. Add a settings toggle in `src/app/settings/page.tsx`.

**Depends on:** Transactional emails PR shipped.

---

## T5 — Balance auto-recharge

**What:** Automatically top up the user's balance when it drops below a configurable threshold.

**Why:** The insufficient-balance email notifies users but doesn't prevent the failure. Auto-recharge eliminates the 402 problem entirely for users with saved payment methods (Stripe saved card already implemented in `AddFundsModal.tsx`).

**Where to start:** Add a `Rule` type `auto_recharge` with `minBalanceUSD` and `rechargeAmountUSD`. Trigger from `deductUserQuota()` when balance drops below threshold.

**Depends on:** Transactional emails PR shipped (to notify on recharge); T4 (email preferences for recharge notification).

---

## T6 — Voice preview proxy

**What:** Proxy voice preview audio through Aporto (`GET /api/proxy/preview?url={preview_url}`) instead of loading directly from ElevenLabs URLs. Cache in R2 on first hit.

**Why:** When the dashboard plays a voice preview, the browser sends the Aporto dashboard domain as a referrer to ElevenLabs. ElevenLabs can see which voices your users audition — a competitive intelligence leak. A proxy also enables caching: once a user plays Bella's preview, subsequent plays are instant.

**Pros:** Breaks the referrer chain. R2 cache eliminates repeat latency. No ElevenLabs rate-limit exposure on preview traffic.

**Cons:** Adds a streaming proxy route and R2 cost (~negligible per audio file). Slightly more complex `/dashboard/voices` audio implementation.

**Context:** The Capability Catalog plan (Capability Catalog, 2026-04-23) defers this. The `preview_url` from ElevenLabs is stored in `ProviderOption.metadata.preview_url` during sync. The proxy just fetches that URL server-side and streams it back.

**Where to start:** `src/app/api/proxy/preview/route.ts` — validate the `url` param (must be an allowed domain), fetch, stream response. Add R2 caching layer with a long TTL (preview audio doesn't change).

**Depends on:** Capability Catalog V1 shipped (sync stores preview_url in metadata).

---

## T7 — Replace GitHub Actions sync cron with in-app scheduler

**What:** Move the `sync-provider-options` daily cron from GitHub Actions to an in-app scheduler with delivery guarantees (Inngest or Trigger.dev).

**Why:** GitHub Actions scheduled workflows are documented as best-effort — they can be delayed hours under load, or silently skipped if the repo has no recent activity. For a sync that gates what voices agents see, a missed run means 24h+ stale data with no alert. Inngest/Trigger.dev provide: delivery guarantees, built-in run history, manual trigger via UI, and failure alerting.

**Pros:** Reliable delivery. Observable run history without digging through GitHub Actions logs. Manual trigger from admin UI when something looks stale.

**Cons:** New dependency. Inngest free tier covers ~50k function runs/month. Trigger.dev has similar pricing. Requires updating the cron auth to use the scheduler's signature verification instead of `CRON_SECRET`.

**Context:** Chosen as GitHub Actions in Capability Catalog plan due to lack of Vercel deployment. If Aporto ever moves to Vercel, use Vercel cron instead. If staying on current hosting, Inngest is the right call.

**Where to start:** Replace `src/app/api/cron/sync-provider-options/route.ts` POST handler with an Inngest function. Keep the same logic. Remove the GitHub Actions workflow file.

**Depends on:** Capability Catalog V1 shipped and running.

---

## T8 — Voice Browser UI

**What:** Build `/dashboard/voices` — a developer-facing page to browse, preview, and copy voice IDs without needing to call the MCP tool manually.

**Why:** V2 was cut from the initial Capability Catalog scope because Aporto is an agent-first product and agents use `aporto_list_options` directly. But developers still need to discover and audition voices when configuring their agents. A decent voice browser removes the need to cross-reference ElevenLabs docs.

**Pros:** Developer experience win. Makes Aporto self-contained — no need to visit ElevenLabs dashboard to find voice IDs. Adds a visible UI artifact that demonstrates the catalog is working.

**Cons:** Agents don't need it — pure developer DX, not agent value. Blocked on T6 (voice preview proxy) for proper privacy.

**Context:** Design review decision from 2026-04-23. Approved design direction: **list view + filter chips** (not card grid). Approved mockup saved at `~/.gstack/projects/aporto-tech-app.aporto/designs/voice-browser-20260423/variant-B.png`. REST endpoint needed: `GET /api/skills/{skillId}/options?type=voice&query=...&page=0`. Files: `src/app/dashboard/voices/page.tsx`, `src/app/api/skills/[id]/options/route.ts`.

**Where to start:** Read the approved mockup. Build the REST endpoint first (simple SELECT from ProviderOption). Then build the page with DashboardLayout, a search input, filter chips (gender/language), and a list row per voice with Copy ID button.

**Depends on:** Capability Catalog V1 shipped. T6 (voice preview proxy) recommended before launch.

---

## T9 — Universal MCP SkillRun adapters

**What:** Finish the universal Aporto skill lifecycle so all MCP skills can return a final result or a structured `runId`, not raw provider-specific task handles.

**Why:** Aporto aggregates many skill providers: media generation, scrapers, SMS/email verification, enrichment, DB/server provisioning, browser automation, and future third-party MCP tools. Agents should call `aporto_run_skill` and get `succeeded`, `running`, `waiting`, or `failed` with a normalized contract.

**Current state:** `SkillRun`, `aporto_run_skill`, `aporto_get_skill_run`, provider-aware discovery, and KIE first-pass async handling are implemented. Production discovery and run status routes are live.

**Remaining work:** Add adapters for Apify, verification flows, provisioning flows, generic async HTTP providers, webhook callbacks, provider-level embeddings, run reconciliation, and admin observability.

**Where to start:** Read `docs/autoplan/mcp-skill-run-lifecycle-20260510.md`, then finish KIE production terminal-result verification and implement the Apify adapter next.

**Depends on:** Latest MCP lifecycle deployment and `SkillRun` migration.
