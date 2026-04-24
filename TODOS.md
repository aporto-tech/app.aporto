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

## T3 — SDK v0.2: activate real service modules

**What:** Implement real logic in `packages/sdk/src/modules/audio.ts`, `images.ts`, `browser.ts`, `compute.ts`, `messaging.ts`, `db.ts`, `sms.ts` (currently stubs throwing `AportoNotAvailableError`).

**Why:** 78% of the SDK's advertised surface throws on call. For the "single API key for all services" promise to be credible, at least 3-4 more modules need real implementations. The `@aporto/sdk` Guide page will look hollow with 7 stubs.

**Pros:** Completes the SDK value proposition. Developers can actually use it for full-stack AI agents.

**Cons:** Requires confirming which routes are live on `api.aporto.tech` for each service first.

**Context:** From the design doc Open Questions: "Does `api.aporto.tech` currently proxy the non-LLM services (Linkup, ElevenLabs, Fal.ai, etc.) or are those routes yet to be built?" This must be confirmed before any v0.2 implementation. Order of priority once routes are live: audio (ElevenLabs TTS/STT), images (Fal.ai), then others.

**Where to start:** `packages/sdk/src/modules/` — remove the stub throw, add real `fetch` call to the confirmed route. Keep error types consistent with `AportoError`.

**Depends on:** api.aporto.tech routing confirmed for each service. @aporto npm org created. SDK v0.1 published.

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
