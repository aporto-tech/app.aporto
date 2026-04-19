<!-- /autoplan restore point: /Users/igortkachenko/.gstack/projects/aporto-tech-app.aporto/main-autoplan-restore-20260418-134929.md -->

# Plan: $400 Developer Giveaway + x402 Client-Side Payment Module

**Date:** 2026-04-18
**Branch:** main
**Author:** igortkachenko

---

## Summary

Two parallel initiatives to drive developer adoption and differentiate Aporto technically:

1. **$400 Developer Giveaway** — a limited-time promotion. Developers who install `@aporto-tech/sdk`, connect to the LLM gateway via `api.aporto.tech/v1`, and make ≥10 LLM requests receive $400 in Aporto credits via promo code.

2. **x402 Client-Side Payment Module** — add `createX402Fetch()` to the SDK. When an AI agent calls an external API that responds with HTTP 402 + x402 payment headers (`X-Payment-Network`, `X-Payment-Recipient`, `X-Payment-Amount`), the SDK auto-pays from the caller's Aporto balance and retries. No on-chain crypto. Payments use Aporto's internal credit system to stay outside money-transmission regulations.

---

## Problem

Developers evaluating Aporto today have no compelling reason to switch from OpenAI direct or competing proxies (e.g., Sapiom.ai). We need:
- A growth driver that converts developer curiosity into first real usage
- A technical differentiator that makes Aporto the natural hub for agent-to-agent payments

---

## Premises

1. Developers respond to concrete economic incentives ($400 is meaningful for an indie dev or small team).
2. x402 adoption is accelerating (Coinbase standard, Sapiom already supporting it).
3. Using Aporto internal credits for x402 payments (vs. real USDC) avoids money-transmission regulation, making it safe to ship fast.
4. The giveaway can be verified programmatically using existing request logs + promo code infrastructure.
5. x402 has zero impact on happy-path LLM speed (interceptor only activates on 402 responses).
6. Existing OpenAI-format users (using `api.aporto.tech/v1` directly, no SDK) need zero changes.

---

## Feature 1: $400 Developer Giveaway

### User Journey

1. Developer sees giveaway announcement (Twitter, HN, Discord)
2. Lands on `aporto.tech/giveaway` landing page
3. Installs `@aporto-tech/sdk`, connects their OpenAI client to `api.aporto.tech/v1`
4. Makes ≥10 LLM requests (any model)
5. Submits claim form (email + SDK token / account email)
6. Admin verifies via request logs
7. Promo code for $400 credit issued to their account

### Implementation

**Files to create/modify:**

- `src/app/giveaway/page.tsx` — landing page with clear CTA and code snippet
- `src/app/api/giveaway/claim/route.ts` — claim submission endpoint
  - Accepts: `{ email: string, accountEmail: string }`
  - Validates: ≥10 LLM requests in logs for that newApiUserId in last 30 days
  - Creates: `GiveawayApplication` DB record (status: pending)
  - Sends: confirmation email to applicant
- `src/app/api/admin/giveaway/route.ts` — admin endpoint to approve claims
  - On approve: calls existing `/api/promo/redeem` flow or directly credits via `safeTopUp`
- `prisma/schema.prisma` — add `GiveawayApplication` model
  ```
  model GiveawayApplication {
    id          Int      @id @default(autoincrement())
    email       String
    newApiUserId Int?
    requestCount Int
    status      String   @default("pending") // pending | approved | rejected
    promoCode   String?
    createdAt   DateTime @default(now())
    processedAt DateTime?
  }
  ```

**Budget cap:** Total giveaway budget: $400 × N participants (to be set). Admin controls approval gate; no auto-approval on first version.

**Verification logic:**
```typescript
// src/app/api/giveaway/claim/route.ts
const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
const logs = await fetchNewApiLogs(newApiUserId, since);
const llmRequests = logs.filter(l => l.type === 'chat' || l.type === 'completion');
if (llmRequests.length < 10) return 400 "Need ≥10 LLM requests";
```

---

## Feature 2: x402 Client-Side Payment Module

### What is x402?

x402 is an HTTP-based micropayment protocol (Coinbase standard). When an agent calls an external API that requires payment:
1. Server returns `HTTP 402 Payment Required` with headers:
   - `X-Payment-Network: base`
   - `X-Payment-Recipient: 0x...`
   - `X-Payment-Amount: 0.001`
2. Client auto-pays (from balance) and retries with proof header `X-Payment-Proof: ...`

Aporto's implementation: instead of real USDC, we deduct from the user's Aporto credit balance and issue a signed proof token.

### SDK Module: `packages/sdk/src/modules/x402.ts`

```typescript
export function createX402Fetch(apiKey: string): typeof fetch {
  return async function x402Fetch(input, init) {
    const response = await fetch(input, init);

    if (response.status !== 402) return response;

    const network = response.headers.get('X-Payment-Network');
    const recipient = response.headers.get('X-Payment-Recipient');
    const amount = response.headers.get('X-Payment-Amount');

    // Not an x402 payment request — return as-is
    if (!network || !recipient || !amount) return response;

    // Pay via Aporto balance
    const payRes = await fetch('https://api.aporto.tech/x402/pay', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ network, recipient, amount }),
    });

    if (!payRes.ok) throw new Error(`x402 payment failed: ${payRes.status}`);
    const { proof } = await payRes.json();

    // Retry original request with payment proof
    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        'X-Payment-Proof': proof,
      },
    });
  };
}
```

**Usage in SDK client:**
```typescript
// packages/sdk/src/index.ts — expose on AportoClient
this.fetch = createX402Fetch(apiKey);
```

**Usage by developer:**
```typescript
const aporto = new AportoClient({ apiKey: 'sk-live-...' });
// Use aporto.fetch() instead of global fetch for x402-compatible APIs
const data = await aporto.fetch('https://some-x402-api.com/endpoint');
```

### Backend: `src/app/api/x402/pay/route.ts`

```typescript
import { validateApiKeyOrSession } from '@/lib/serviceProxy';
import { deductUserQuota } from '@/lib/serviceProxy';
import { signX402Proof } from '@/lib/x402';

export async function POST(req: NextRequest) {
  const auth = await validateApiKeyOrSession(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { network, recipient, amount } = await req.json();
  const costUSD = parseFloat(amount);

  const deductResult = await deductUserQuota(auth.newApiUserId, costUSD);
  if (deductResult) return deductResult; // 402 insufficient balance

  // Sign proof of payment (HMAC with our secret key + timestamp + recipient + amount)
  const proof = signX402Proof({ network, recipient, amount, userId: auth.newApiUserId });

  await logServiceUsage(auth.newApiUserId, 'x402', network, costUSD, { recipient, amount });

  return NextResponse.json({ proof });
}
```

### New utility: `src/lib/x402.ts`

```typescript
import { createHmac } from 'crypto';

const X402_SECRET = process.env.X402_SECRET || '';

export function signX402Proof(params: {
  network: string;
  recipient: string;
  amount: string;
  userId: number;
}): string {
  const ts = Date.now();
  const payload = `${ts}:${params.network}:${params.recipient}:${params.amount}:${params.userId}`;
  const sig = createHmac('sha256', X402_SECRET).update(payload).digest('hex');
  return `v1.${ts}.${sig}`;
}
```

---

## What Already Exists (Leverage Map)

| Sub-problem | Existing code |
|---|---|
| Balance check + deduction | `src/lib/serviceProxy.ts:deductUserQuota()` |
| API key / session auth | `src/lib/serviceProxy.ts:validateApiKeyOrSession()` |
| Idempotent top-up | `src/lib/topup.ts:safeTopUp()` |
| Promo code redemption | `src/app/api/promo/redeem/route.ts` |
| Promo code creation (admin) | `src/app/api/admin/promo/route.ts` |
| Service usage logging | `src/lib/serviceProxy.ts:logServiceUsage()` |
| Email confirmation | `src/lib/emails.ts:sendTopUpConfirmationEmail()` |
| Request logs (NewAPI) | `/api/newapi/logs` route |
| SDK client | `packages/sdk/src/index.ts` → `AportoClient` |

---

## What is NOT in Scope

- Real USDC/on-chain payments (regulatory risk — deferred indefinitely)
- x402 server-side (Aporto as an x402 payee, not just payer) — deferred to TODOS
- SDK modules T3 (audio, images, browser, etc.) — stays in TODOS.md
- E2E test suite T2 — stays in TODOS.md
- Auto-recharge T5 — stays in TODOS.md
- Giveaway auto-approval (manual review for v1 to control budget)
- Rate limiting giveaway claims per IP (v1 ships without this)

---

## Effort Estimate

| Task | Human | CC+gstack |
|------|-------|-----------|
| GiveawayApplication DB migration | 1h | 5 min |
| Giveaway landing page | 4h | 20 min |
| Claim API + admin API | 3h | 15 min |
| x402 SDK module | 2h | 10 min |
| x402 backend route + lib | 2h | 10 min |
| SDK docs update | 1h | 5 min |
| **Total** | **~2 days** | **~65 min** |

---

## Environment Variables Required

- `X402_SECRET` — HMAC signing key for x402 proof tokens (new)

---

## Test Plan (outline)

1. Giveaway claim with < 10 requests → 400 response
2. Giveaway claim with ≥ 10 requests → application created, confirmation email sent
3. Duplicate claim same email → 409 or idempotent response
4. x402 fetch: 200 response → passes through unchanged
5. x402 fetch: 402 without headers → passes through unchanged
6. x402 fetch: 402 with x402 headers → pays and retries
7. x402 fetch: 402 with headers but insufficient balance → throws
8. x402 proof signing: deterministic with same inputs

---

---

# Phase 1: CEO Review

*Mode: SELECTIVE EXPANSION | Branch: main | Codex: unavailable [subagent-only]*

---

## PRE-REVIEW SYSTEM AUDIT

**Recently touched files (30 days, top 5):**
- `src/app/dashboard/page.tsx` (10x) — main analytics + billing UI
- `src/app/components/AddFundsModal.tsx` (9x) — payment flow
- `src/app/api/webhooks/nowpayments/route.ts` (7x) — crypto webhook
- `prisma/schema.prisma` (7x) — schema evolving fast
- `src/lib/newapi.ts` (5x) — gateway helpers, logs, spending

**Design doc found:** `igortkachenko-main-design-20260412-084044.md` — The AI Conquest Map (viral mechanics). Different feature, approved. Signals a separate distribution initiative is already planned.

**TODOs in play:** T1 (Bitrix24 retry), T2 (E2E tests), T3 (SDK stubs), T4 (email opt-out), T5 (auto-recharge). The plan touches T3 (SDK stubs) and is independent of T1, T2, T4, T5.

---

## 0A. Premise Challenge

The plan rests on 6 premises. User confirmed all as correct (gate passed ✓).

| Premise | Status | Risk | Notes |
|---------|--------|------|-------|
| 1. $400 is meaningful to target devs | Accepted | Low | Credit-only, not cash — framing matters in copy |
| 2. x402 adoption accelerating | Accepted (user-confirmed) | Medium | Pre-bets position: building as infrastructure/marketing story now |
| 3. Internal credits avoid MTL regulation | Accepted (user confirmed) | Residual | Add a note in codebase; legal review recommended before prod rollout |
| 4. Giveaway verifiable programmatically | Accepted | Low | `newApiGetLogs` already exists, clean interface |
| 5. x402 has no impact on happy-path LLM speed | Valid | None | Interceptor only fires on 402, transparent on 200 |
| 6. Existing users need zero changes | Valid | None | SDK opt-in, direct baseURL users unaffected |

**Critical risk noted:** The "$400 in credits" incentive is circular only if activation rate is low. Mitigated by raising the giveaway threshold so recipients are already activated users.

---

## 0B. Existing Code Leverage Map

| Sub-problem | Existing code | Status |
|---|---|---|
| Balance check + deduction | `src/lib/serviceProxy.ts:deductUserQuota()` | Ready |
| API key / session auth | `src/lib/serviceProxy.ts:validateApiKeyOrSession()` | Ready |
| Idempotent top-up | `src/lib/topup.ts:safeTopUp()` | Ready |
| Promo code creation (admin) | `src/app/api/admin/promo/route.ts` | Ready |
| Promo code redemption | `src/app/api/promo/redeem/route.ts` | Ready |
| Service usage logging | `src/lib/serviceProxy.ts:logServiceUsage()` | Ready |
| LLM request logs query | `src/lib/newapi.ts:newApiGetLogs()` | Ready |
| Email confirmation | `src/lib/emails.ts:sendTopUpConfirmationEmail()` | Ready |
| SDK client base | `packages/sdk/src/index.ts:AportoClient` | Ready |
| Admin auth guard | `src/app/api/admin/promo/route.ts:isAdmin()` | Ready (reuse pattern) |

Every sub-problem has a direct existing code hook. This plan is additive, not parallel.

---

## 0C. Dream State Diagram

```
CURRENT STATE                    THIS PLAN                     12-MONTH IDEAL
─────────────────────────────────────────────────────────────────────────────
• No acquisition flywheel      → $400 giveaway drives       → Conquest Map + giveaway
• 30% discount alone           →   first-mover devs to        creates self-sustaining
  not compelling               →   install SDK + make          acquisition loops
• SDK = LLM wrapper            →   real API calls           → SDK = universal agent
  + 78% broken stubs           → x402 module makes SDK         payment rail
• Competitors (Sapiom)         →   differentiated from      → Aporto is the x402
  have x402 already            →   bare proxy                  reference implementation
• No agent payment             → Internal credit x402       → Server-side payee:
  infrastructure               →   interceptor ships           other APIs accept
                               → Giveaway + x402 in           x402 payments via Aporto
                                  PLAN.md scope
```

This plan moves toward the 12-month ideal but leaves two large gaps: the Conquest Map (tracked in design doc) and server-side x402 payee (deferred per plan).

---

## 0C-bis. Implementation Alternatives

```
APPROACH A: Giveaway Only (current plan minus x402)
  Summary: Ship $400 giveaway mechanics only. x402 deferred.
  Effort:  S (human: 2 days / CC: ~30 min)
  Risk:    Low
  Pros:    Fast time-to-market; no ecosystem dependency; clear ROI
  Cons:    No technical differentiation; pure acquisition without moat
  Reuses:  promoCode, safeTopUp, newApiGetLogs

APPROACH B: Giveaway + x402 Client-Side (current plan)
  Summary: Ship giveaway and x402 SDK interceptor + backend in same sprint.
  Effort:  M (human: ~3 days / CC: ~65 min)
  Risk:    Low–Medium
  Pros:    Technical differentiation; matches Sapiom direction; SDK story upgrade
  Cons:    Ecosystem pre-bets (few live x402 APIs); adds x402 backend surface
  Reuses:  deductUserQuota, validateApiKeyOrSession, logServiceUsage

APPROACH C: Giveaway + x402 Client + Server-Side Payee
  Summary: Also build /x402/receive route so Aporto users can monetize their own APIs.
  Effort:  L (human: ~1 week / CC: ~2h)
  Risk:    Medium (more moving parts, regulatory surface)
  Pros:    Network effects; two-sided moat; first mover on payee infrastructure
  Cons:    Significantly more scope; legal review mandatory before shipping payee side
  Reuses:  All of Approach B + new webhook/settlement layer
```

**RECOMMENDATION: Approach B.** Approach C is the right long-term direction but should be a committed Sprint 2 follow-on, not Sprint 1. Approach A leaves no differentiation. Approach B ships the moat foundation with manageable risk.

---

## 0D. Mode: SELECTIVE EXPANSION

This plan is well-scoped for its stated goal. Expansion candidates surfaced during review:

| Candidate | Effort | Recommendation |
|-----------|--------|----------------|
| Fix ≥3 SDK stub modules before x402 launch | S (CC: ~15 min) | Defer to T3 — separate track, doesn't block giveaway |
| Email domain dedup (fraud control) | XS (CC: ~5 min) | **ADD to this plan** — minimal, essential safety control |
| Hard budget cap (maxApprovals in DB) | XS (CC: ~5 min) | **ADD to this plan** — critical safety feature |
| Giveaway end date | XS (1 field) | **ADD to this plan** — prevents evergreen liability |
| Server-side x402 payee | L | Defer — commit to Sprint 2, add go/no-go criteria |
| T5 auto-recharge | M | Stay in TODOS — useful but different goal (retention vs. acquisition) |

**Auto-decided to add (MECHANICAL, P1 completeness):** email domain dedup, budget cap, end date.
**Deferred:** server-side x402, T5, T3 stub fixes.

---

## CLAUDE SUBAGENT — CEO Strategic Review (independent)

**Critical findings (severity: Critical):**
- No hard budget cap or end date on giveaway → trust incident risk if viral + admin backlog
- 10-request threshold trivially gameable (90-second for-loop qualifies)

**High findings:**
- $400 credit incentive circular — value only real if dev already trusts Aporto; fix by raising threshold so recipients are activated users
- x402 ecosystem: few live external APIs as of April 2026; plan is a pre-bet (user confirmed this posture is acceptable)
- x402 ships on top of 78% broken SDK surface — credibility risk
- Sapiom already has x402 client-side; no differentiation analysis in plan

**Medium findings:**
- No retention analysis; giveaway is pure acquisition
- Two features with different timelines in one sprint — needs explicit sequencing
- Server-side x402 is the strategic moat; client-side is a feature

[Codex voice: unavailable]

---

## CEO DUAL VOICES — CONSENSUS TABLE

```
CEO DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex   Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   YES     N/A     [subagent-only]
  2. Right problem to solve?           YES*    N/A     [subagent-only]
  3. Scope calibration correct?        YES**   N/A     [subagent-only]
  4. Alternatives sufficiently explored?YES    N/A     [subagent-only]
  5. Competitive/market risks covered? NO      N/A     DISAGREE → surfaced
  6. 6-month trajectory sound?         YES**   N/A     [subagent-only]
═══════════════════════════════════════════════════════════════
* Requires threshold fix + budget cap
** Requires Sapiom differentiation section
```

---

## Section 1: Problem Framing

The plan solves a real problem: developer acquisition for Aporto has no flywheel. The $400 giveaway + SDK activation is a well-scoped, time-bounded acquisition tactic. Verdict: sound.

**Gap flagged:** Plan has no retention metric as a success criterion alongside acquisition. Add to success criteria: "Week-4 retention of giveaway cohort ≥ 40%." This is observability, not scope.

---

## Section 2: Error & Rescue Registry

| Error | Trigger | Caught by | User sees | Tested? |
|-------|---------|-----------|-----------|---------|
| Claim < 10 (→ 25) requests | Dev submits early | Claim API | 400 "Need ≥25 LLM requests across 3 days" | Plan yes |
| Duplicate claim same email | Dev submits twice | DB unique on email | 409 "Application already submitted" | Plan yes |
| Budget cap reached | N applications hit maxApprovals | Config check at claim time | 410 "Giveaway quota filled" | Plan: add |
| x402 payment failed (insufficient balance) | Agent calls x402 API with empty balance | deductUserQuota → 402 | SDK throws AportoInsufficientBalanceError | Plan: add |
| x402 payment 402 without headers | External API 402 not x402 | Interceptor header check | Pass-through — returns 402 as-is | Plan yes |
| x402 proof signing key missing | X402_SECRET not set | Runtime HMAC | 500 + log | Plan: add |
| GiveawayApplication DB write fails | Transient DB error | try/catch in claim route | 500 "Please try again" | Plan: add |

---

## Section 3: Failure Modes Registry

| Mode | Severity | Probability | Detection | Recovery |
|------|----------|-------------|-----------|----------|
| Giveaway goes viral: 500+ claims, admin backlog | HIGH | Medium | Alert when pending > N | Hard cap; batch approval UI |
| x402 interceptor infinite retry loop | HIGH | Low | No built-in retry limit | Add max_retries=1 to interceptor |
| x402 proof token reuse (replay attack) | HIGH | Low | No nonce validation in v1 | Add timestamp expiry check (5 min TTL on proof) |
| Giveaway gaming: 25 requests from single script | MEDIUM | High (if no calendar-day check) | Request timestamp spread analysis | ≥3 calendar days spread requirement |
| X402_SECRET not set in production | CRITICAL | Low | Signing silently fails | Add startup assertion: process.env.X402_SECRET must be set |
| GiveawayApplication approved but safeTopUp fails | MEDIUM | Very low | safeTopUp throws | Wrap in try/catch, log failure, retry queue |
| Email domain exhaustion (1 company, 50 addresses) | MEDIUM | Medium without domain dedup | Many claims same @domain | Email domain dedup check |

---

## Section 4: Scope & Dependencies

**Scope is well-bounded.** 9 new files (3 API routes, 1 lib, 1 SDK module, 1 util, 1 page, 1 schema migration, 1 env var). No existing file deletions. All builds on existing auth, promo, and quota infrastructure.

**Dependencies:**
- `X402_SECRET` must be added to production `.env`
- Prisma migration for `GiveawayApplication` model + `GiveawayConfig` model (new: add budget cap)
- `@aporto-tech/sdk` version bump to 0.3.0 after x402 module lands

**Blast radius (files touched):**
```
prisma/schema.prisma                     (migration)
packages/sdk/src/index.ts               (expose createX402Fetch)
packages/sdk/src/modules/x402.ts        (new)
packages/sdk/package.json               (version bump to 0.3.0)
src/app/giveaway/page.tsx               (new)
src/app/api/giveaway/claim/route.ts     (new)
src/app/api/admin/giveaway/route.ts     (new)
src/app/api/x402/pay/route.ts           (new)
src/lib/x402.ts                         (new)
```

---

## Section 5: Security Review

**x402 proof token replay:** A valid proof token could theoretically be reused if captured in transit. Fix: add `exp` (expiry) to proof payload — 5-minute TTL. Validate `exp` on any future server-side endpoint that verifies proofs.

**x402 interceptor SSRF potential:** `createX402Fetch` takes `input` (any URL) and fetches it. This is the same as `global fetch` — no SSRF risk beyond what already exists. Not a new attack surface.

**Giveaway endpoint abuse:** Claim endpoint takes `email` + `accountEmail`. Without rate limiting, a single IP can POST hundreds of claims. Minimum mitigation: IP rate limit (1 claim per IP per hour) or email domain dedup. Email domain dedup is lighter and catches the main abuse vector.

**Admin endpoint auth:** `src/app/api/admin/giveaway/route.ts` should use the same `isAdmin()` pattern from `admin/promo/route.ts` (checks `ADMIN_EMAIL` env var). Not a new pattern.

**Env var guard:** `X402_SECRET` must be non-empty at runtime. Add assertion at module load time.

---

## Section 6: Observability

**Add to giveaway claim API:**
- `console.log("[giveaway] claim submitted", { email, requestCount, daySpan })` — for monitoring
- `console.log("[giveaway] claim rejected: insufficient requests", { email, requestCount })` — for tuning threshold

**Add to x402 pay API:**
- `console.log("[x402] payment processed", { userId, network, recipient, amount, costUSD })` — usage tracking
- Already uses `logServiceUsage()` — good.

**Missing:** No dashboard visibility for giveaway applications. Admin needs to be able to see pending applications. The plan's admin API route handles this but needs to be wired into a UI (or at least return paginated JSON the admin can check manually).

---

## Section 7: DX / Developer Experience

**Giveaway landing page:** `src/app/giveaway/page.tsx` should include:
1. Clear eligibility criteria (prominently stated: "25 LLM requests across 3 days, 2+ models")
2. Copy-paste quickstart code snippet (3 lines: install SDK, set base URL, make a request)
3. Progress indicator: "You've made X of 25 required requests" (visible after login)

**x402 SDK module:** `createX402Fetch(apiKey)` should be documented in the SDK README. The name is clear and guessable. No issues.

---

## Section 8: Competitive Analysis

**Sapiom.ai** already has x402 client-side. Aporto's differentiation:
1. **Lower prices** (30% cheaper) — the x402 interceptor drains a cheaper balance
2. **Unified SDK** — x402 + LLM + SMS + search in one package vs. Sapiom's API-only approach
3. **Future server-side payee** — if Aporto ships Sprint 2 server-side, it becomes the x402 reference platform, not just another client

**Recommendation added to plan:** Add "vs. Sapiom" one-liner to giveaway landing page copy. "Same x402 protocol, 30% cheaper credits."

---

## Section 9: Timeline & Phasing

**Updated (auto-decided, D5):**
- **Sprint 1 (Giveaway):** `GiveawayApplication` model, `GiveawayConfig` model, claim API, admin API, landing page. Ships in ~1 week.
- **Sprint 2 (x402):** x402 SDK module, `/api/x402/pay` route, `src/lib/x402.ts`. Ships in ~1 week after Sprint 1.
- **Sprint 3 (Server-side payee):** Go/no-go: ≥10 developers use `createX402Fetch()` within 30 days of Sprint 2. If yes → build. If no → revisit in month 3.

**Rationale:** Giveaway is time-sensitive. x402 is ecosystem-timed. Sequential shipping reduces risk and lets x402 be announced with giveaway cohort already onboarded.

---

## Section 10: TODOS.md Updates

Items deferred from this plan:
- Server-side x402 payee → add to TODOS.md as T6 with Sprint 3 go/no-go criteria
- Fix ≥3 SDK stub modules (T3) before SDK v0.3.0 announcement
- T5 (auto-recharge) — remains in queue, important for retention

---

## Section 11: Design Scope (UI)

**UI scope detected.** Giveaway landing page (`src/app/giveaway/page.tsx`) is new UI. Coverage in Phase 2 (Design Review).

---

## NOT In Scope (CEO Phase)

| Item | Rationale |
|------|-----------|
| Real USDC / on-chain payments | Money transmission gate; internal credits are the right v1 |
| x402 server-side (Aporto as payee) | Sprint 3 with go/no-go criteria |
| T3 SDK stubs (audio, images, etc.) | Separate effort, separate sprint |
| T5 auto-recharge | Retention play, different goal |
| Giveaway auto-approval | Manual review for v1 to control budget |
| IP rate limiting | Email domain dedup sufficient for v1 |
| Giveaway leaderboard / social sharing | Out of scope for giveaway v1 |

---

## CEO Completion Summary

| Dimension | Assessment |
|-----------|------------|
| Problem framing | ✅ Correct: acquisition + technical differentiation |
| Premise validity | ✅ All confirmed (user gate passed) |
| Scope | ✅ Well-bounded; 3 additions approved (budget cap, end date, email dedup) |
| Competitive position | ⚠️ Sapiom already has x402 — differentiation via price + unified SDK |
| Execution risk | ⚠️ Giveaway fraud controls (budget cap added); x402 ecosystem pre-bet |
| 6-month trajectory | ✅ Sprint 1→2→3 roadmap with go/no-go criteria |

**Mode:** SELECTIVE EXPANSION
**Verdict:** Plan approved with 5 auto-additions (threshold raise, budget cap, end date, email dedup, Sprint 3 commit). 3 taste decisions surfaced for final gate.

---

**PHASE 1 COMPLETE.** Claude subagent: 9 concerns. Codex: unavailable. Consensus: 5/6 dimensions (Codex voice: N/A).

---

# Phase 2: Design Review

*UI scope detected: giveaway landing page + progress indicator + admin UI. Codex: unavailable [subagent-only]*

---

## Design Scope Assessment

Initial completeness: **3/10.** The plan specified components (form, code snippet, progress indicator) but no hierarchy, no state machine, no admin UI. Design review raised this to a plan-blocking gap.

---

## CLAUDE SUBAGENT — Design Review (independent)

**Critical findings:**
1. No page hierarchy/hero spec — implementer will make arbitrary choices; those choices ship
2. Post-claim states (pending/approved/rejected) unspecified — step 5-7 is a "black hole"
3. Progress indicator shows only 1 of 3 threshold dimensions (requests only, not days + models) → developer can believe they qualify while failing days/models check → trust incident

**High findings:**
4. Admin UI missing — only API exists; manual review at scale is impossible without UI
5. Claim form asks for `accountEmail` which can be derived from session — unnecessary friction
6. Not-logged-in state unspecified
7. `expiresAt` not surfaced on landing page (no urgency/deadline signal)

[Codex: unavailable]

---

## Design Litmus Scorecard

| Dimension | Score | Status |
|-----------|-------|--------|
| Information hierarchy | 2/10 | Fix: add page anatomy |
| Missing states coverage | 1/10 | Fix: 9-state machine |
| User journey coherence | 4/10 | Fix: post-submission state |
| Specification clarity | 3/10 | Fix: form fields, snippet copy, admin UI |
| Responsive/mobile | 5/10 | Note: code snippets must scroll |
| Accessibility | 5/10 | No blockers, standard patterns apply |
| Admin experience | 0/10 | Fix: add admin UI page |

---

## Auto-Decisions Applied (Design Phase)

All MECHANICAL — no taste decisions required.

### D9: Add /giveaway page state machine (P1 completeness)

The `/giveaway` page renders one of these 9 states:

```
1. anonymous          → Landing page + "Sign up to participate" CTA
2. no_requests        → Landing + progress bar (0/25, 0/3, 0/2) + quickstart snippet
3. in_progress        → Progress bar (X/25, X/3, X/2) + encouragement copy
4. qualified          → "You qualify! Submit your claim" CTA + form
5. pending            → "Application received. We review within 2 business days."
6. approved           → "Approved! Use promo code: XXXX-XXXX"
7. rejected           → "Not eligible this time." + reason if possible
8. expired            → "This offer has ended."
9. quota_filled       → "All spots have been claimed."
```

State is determined by:
- Auth status → `authenticated` or `anonymous`
- `GiveawayApplication` DB record for this userId (if exists: `status`)
- Request count + day spread + model count (from `newApiGetLogs`)
- `GiveawayConfig.expiresAt` and `GiveawayConfig.maxApprovals`

### D10: Three-part progress indicator (P1 completeness)

Progress indicator shows all three threshold dimensions:

```
Your progress:
  [████████░░] 20/25 requests
  [███░░░░░░░] 2/3 calendar days
  [██████████] 2/2 models ✓
```

All three must be green to qualify. Showing only request count is misleading when days or models are failing.

### D11: Remove accountEmail from claim form (P5 explicit)

Server derives `newApiUserId` and `email` from NextAuth session. No form field needed. Claim form becomes a single button: "Submit Claim." Optional: contact email (for devs who want a different notification address — make this optional, pre-fill from session email).

Updated claim API payload: `POST /api/giveaway/claim` with no body required (or optional `{ contactEmail? }`). Server reads userId from session.

### D12: Add /admin/giveaway/page.tsx (P1 completeness)

Minimum viable admin UI:
- Protected by `isAdmin()` from session
- Table: email | requests | days | models | submitted | status | [Approve] [Reject]
- Counter header: "X pending / Y approved / Z total / W budget remaining"
- Bulk approve checkbox + action
- Wire to existing `src/app/api/admin/giveaway/route.ts`

Add to file list: `src/app/admin/giveaway/page.tsx`

### D13: Progress indicator update mechanism (P5 explicit)

Fetch on page load via `useEffect`. No polling. No WebSocket. Request counts update when developer navigates to `/giveaway`. Good enough — developer checks manually after making requests.

### D14: Surface expiresAt on landing page (P1 completeness)

If `GiveawayConfig.expiresAt` is set, show "Offer ends [date]" below the headline. If not set, show nothing. Creates urgency and prevents confusing expired-state UX.

### D15: Write actual quickstart snippet in plan

```typescript
// 1. Install
npm install @aporto-tech/sdk

// 2. Make your first request (any OpenAI-compatible client works too)
import OpenAI from 'openai';
const client = new OpenAI({
  baseURL: 'https://api.aporto.tech/v1',
  apiKey: 'sk-live-YOUR_API_KEY',  // from dashboard
});
const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(response.choices[0].message.content);
```

Note: "Make 25 requests across 3 days using 2+ different models to qualify."

### D16: Effort estimate update

Added `/admin/giveaway/page.tsx` to file list. +1.5h human / +10 min CC to estimate.

---

## Page Anatomy (auto-specified)

```
/giveaway — Hero Section
─────────────────────────────────────────
  H1: "Get $400 in Aporto credits"
  Subhead: "Make 25 AI requests across 3 days → claim $400."
  [Offer ends: YYYY-MM-DD]          ← from GiveawayConfig.expiresAt
  [Sign up →] or [Check my progress →]  ← state-dependent CTA
─────────────────────────────────────────
  How it works (3 steps):
  1. Install SDK or connect your OpenAI client
  2. Make 25+ requests across 3 days, using 2+ models
  3. Submit your claim — we'll issue your credits within 2 business days
─────────────────────────────────────────
  Code snippet (scrollable, copy button):
  [see D15 above]
─────────────────────────────────────────
  If authenticated + has requests:
  Progress bar (D10)
  [Submit Claim] (if qualified) or [Keep going!] (if in-progress)
─────────────────────────────────────────
```

Mobile: single-column, code snippet horizontally scrollable, CTA button full width.

---

## PHASE 2 COMPLETE

Claude subagent: 7 findings (3 critical, 4 high). Codex: unavailable. 8 auto-decisions applied (all MECHANICAL). 0 taste decisions (design phase was structurally clear). Design completeness raised from 3/10 to 8/10.

Passing to Phase 3.

---

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|---------|
| 1 | CEO | Raise giveaway threshold: 10 → ≥25 requests, ≥3 days, ≥2 models | MECHANICAL | P1 completeness | 10 requests gameable in 90s; 25/3-day/2-model bars fraudulent signups | Keep 10 (too easy to game) |
| 2 | CEO | Add GiveawayConfig DB model with maxApprovals + expiresAt | MECHANICAL | P1 completeness | No budget cap = unlimited liability; critical safety feature | No cap (evergreen giveaway) |
| 3 | CEO | Add email domain dedup check at claim time | MECHANICAL | P1 completeness | Minimum fraud control without IP rate limiting overhead | IP rate limit (heavier) |
| 4 | CEO | Add X402_SECRET startup assertion | MECHANICAL | P1 completeness | Silent HMAC failure if env var missing = broken proof tokens | Silently skip signing |
| 5 | CEO | Add x402 proof TTL: 5-minute exp field in proof token | MECHANICAL | P1 completeness | Prevents replay attacks on proof tokens | No expiry (replay risk) |
| 6 | CEO | Add max_retries=1 to x402 interceptor | MECHANICAL | P5 explicit | Infinite retry loop on 402 would drain balance | Unbounded retries |
| 7 | CEO | Timeline split: Giveaway Sprint 1, x402 Sprint 2 | MECHANICAL | P3 pragmatic | Different risk profiles; sequential reduces integration risk | Parallel (increases risk) |
| 8 | CEO | Add Sprint 3 go/no-go criteria for server-side x402 | MECHANICAL | P3 pragmatic | Pre-commitment prevents indefinite deferral | TODOS only (no timeline) |
| 9 | Design | Add 9-state machine to /giveaway page | MECHANICAL | P1 completeness | 5-7 journey black hole; unspecified states ship as broken UX | Single state (landing only) |
| 10 | Design | Three-part progress indicator (requests + days + models) | MECHANICAL | P1 completeness | Single-dimension indicator misleads developer about qualification | Show requests only |
| 11 | Design | Derive userId from session; remove accountEmail field from claim form | MECHANICAL | P5 explicit | Asking for info we already have creates friction and bugs | Keep accountEmail field |
| 12 | Design | Add /admin/giveaway/page.tsx to file list | MECHANICAL | P1 completeness | Admin API without UI is unusable at >10 applications | API-only admin |
| 13 | Design | Progress indicator: page-load fetch, no polling | MECHANICAL | P5 explicit | Simple is correct; over-engineering with WebSocket adds complexity | Real-time push |
| 14 | Design | Surface expiresAt on landing page | MECHANICAL | P1 completeness | Expiry without UI signal = confusing expired state + no urgency | Hide end date |
| 15 | Design | Write actual quickstart snippet in plan | MECHANICAL | P5 explicit | "3 lines" without the actual lines → implementer writes filler copy | Generic description |
| 16 | Design | Effort estimate update: +/admin/giveaway/page.tsx | MECHANICAL | P1 completeness | Admin UI required for giveaway operations | API-only |

---

# Phase 3: Engineering Review

*Codex: unavailable [subagent-only]*

## Architecture: Request Flow Diagrams

### Giveaway Claim Flow

```
Developer Browser          Next.js App            New-API DB         Prisma DB
──────────────────         ──────────────         ──────────         ─────────
GET /giveaway
   ──────────────────────► getServerSession()
                           validateApiKeyOrSession()
                                                   SELECT logs
                                                   WHERE user_id=$1
                                                   AND type=2
                                                   ◄─────────────────
                           ◄────────────────────────────────────────
   ◄── 200 (state=in_progress, requestCount=N, daySpread=M, modelCount=P)

POST /api/giveaway/claim
   ──────────────────────► auth check
                           newApiGetGiveawayEligibility()
                                                   SELECT COUNT(*),
                                                   COUNT(DISTINCT DATE),
                                                   COUNT(DISTINCT model)
                                                   ◄─────────────────
                           check GiveawayConfig.maxApprovals
                                                              SELECT count
                                                              WHERE status='approved'
                                                              ◄────────────
                           prisma.giveawayApplication.create()  ← P2002 idempotent
                                                              INSERT (pending)
                           ◄──────────────────────────────────
   ◄── 200 {status: "pending"}
```

### x402 Payment Flow

```
Agent Code (SDK)           Aporto /api/x402/pay     External API
────────────────           ─────────────────────    ────────────
fetch(url, opts)
   ─────────────────────────────────────────────────────────────► GET /some-data
                                                                   ◄── 402
                                                                       X-Payment-Network: aporto
                                                                       X-Payment-Recipient: recip@aporto
                                                                       X-Payment-Amount: 0.001
   ◄── 402 (intercepted by createX402Fetch wrapper)

POST /api/x402/pay
  {network, recipient, amount, callbackUrl}
   ──────────────────────►
                           validateApiKeyOrSession()
                           deductUserQuota(costUSD)   ← atomic UPDATE WHERE quota>=cost
                           signX402Proof({network, recipient, amount, userId})
                           → "v1.{ts}.{exp}.{HMAC}"
   ◄── 200 {proof: "v1.{ts}.{exp}.{HMAC}"}

fetch(url, { ...opts, headers: { X-Payment-Proof: proof } })
   ─────────────────────────────────────────────────────────────► GET /some-data
                                                                       verify proof
                                                                   ◄── 200 {data}
   ◄── 200 (returned to agent)
```

---

## Engineering Findings (20 total: 5 critical, 6 high, 9 medium/low)

### CRITICAL

**F1: TOCTOU race in `deductUserQuota` (serviceProxy.ts:77-99)**

SELECT quota, then UPDATE — two concurrent 402 responses can both pass the check and both deduct, driving the balance negative. Must be one atomic statement with `WHERE quota >= $1` and rowsAffected check.

Fix:
```typescript
const result = await prisma.$executeRawUnsafe(
  `UPDATE users SET quota = quota - $1, used_quota = used_quota + $1
   WHERE id = $2 AND quota >= $1`,
  quotaCost, newApiUserId
);
if (result === 0) {
  // truly insufficient — re-read balance for email, return 402
  void maybySendLowBalanceEmail(newApiUserId).catch(...)
  return NextResponse.json({ success: false, message: "Insufficient balance" }, { status: 402, headers: { "X-Aporto-Balance-Low": "true" } });
}
```

**F2: x402 proof exp must be in HMAC payload**

If `exp` is stored in the token string but not in the signed payload, an attacker can extend the expiry by modifying the token field without invalidating the HMAC. The canonical payload must be `ts:exp:network:recipient:canonicalAmount:userId`.

**F3: Amount canonicalization required**

`"0.001"` and `"0.0010"` produce different HMACs for the same value. Use `parseFloat(amount).toFixed(6)` before signing and before verification.

**F4: GiveawayConfig null guard missing**

`findFirst()` returns `null` when no seed row exists. Every caller must null-check. Seed migration must insert the default row on first deploy. Crash on null = broken giveaway page for all users.

**F5: `newApiGetGiveawayEligibility` does not exist yet**

`newApiGetLogs()` is paginated and has no aggregation. A new helper is required in `src/lib/newapi.ts` using `COUNT(*)`, `COUNT(DISTINCT DATE(...))`, `COUNT(DISTINCT model_name)` with `type = 2` (numeric, not string).

---

### HIGH

**F6: Missing `@@unique([email])` on `GiveawayApplication`**

Without it, a developer can submit multiple claims. The unique constraint IS the idempotency guard (P2002 pattern from safeTopUp).

**F7: `X402_SECRET` missing startup assertion**

If env var is absent, `createHmac` gets an empty string key — HMACs are technically valid but trivially forgeable. Add assertion at module load time.

**F8: Admin `isAdmin()` hardcodes email**

`src/app/api/admin/promo/route.ts` hardcodes `"pevzner@aporto.tech"`. The giveaway admin route must not repeat this pattern. Use `process.env.ADMIN_EMAIL`.

**F9: `newApiGetGiveawayEligibility` query uses `DATE(to_timestamp(created_at))`**

New-API `created_at` is stored as Unix seconds (integer), not a timestamptz. PostgreSQL's `DATE(to_timestamp(N))` converts correctly but the query must be tested against actual data — if timezone is wrong, `daySpread` understates real spread.

**F10: No rate limiting on `/api/giveaway/claim`**

A bot can hammer the endpoint. Minimum: 5 requests per IP per hour. Can be implemented as a simple in-memory LRU (same pattern as `RECENT_BALANCE_CHECK_CACHE` in serviceProxy.ts).

**F11: x402 proof verification is Aporto-server-only**

External APIs must verify the proof. The verification logic (HMAC check + expiry check) must be published in SDK docs or as a helper. Without this, `createX402Fetch()` is only usable against Aporto's own services.

---

### MEDIUM/LOW

**F12:** `GiveawayApplication.status` should be an enum-style string union, enforced at the API layer — plain `String` with no validation means typos silently corrupt state.

**F13:** Admin approve endpoint must be idempotent — calling approve twice should not double-credit. Use `status != 'approved'` condition in the UPDATE.

**F14:** The `processedAt` field on `GiveawayApplication` must be set on both approve and reject, not just approve — otherwise the audit trail is incomplete.

**F15:** `sendTopUpConfirmationEmail` in topup.ts fire-and-forget is correct — do not change the pattern for giveaway credits.

**F16:** The SDK `createX402Fetch` wrapper must NOT intercept non-x402 402 responses (i.e., 402s without `X-Payment-Network: aporto` header). Check header presence before intercepting.

**F17:** `logServiceUsage` should log x402 payments for analytics — service = "x402", provider = recipient domain, costUSD = parsed amount.

**F18:** The giveaway claim form needs a success state that shows "Application submitted — you'll hear back within 2 business days" not just a 200 JSON response.

**F19:** The `/giveaway` page state machine must handle `quota_filled` (GiveawayConfig.maxApprovals reached) distinctly from `expired` (past expiresAt) — different copy, same "no longer available" outcome.

**F20:** Missing migration seed: `GiveawayConfig` must have one row on first deploy or every page load crashes. Add seed in the migration file itself.

---

## Auto-Decisions: D17–D31

| # | Decision | Classification | Principle | Rationale | Rejected |
|---|----------|----------------|-----------|-----------|---------|
| 17 | Fix TOCTOU: add `AND quota >= $1` to UPDATE + rowsAffected check | MECHANICAL | P1 completeness | Race condition = negative balance = real money loss | Leave SELECT+UPDATE pattern |
| 18 | Include `exp` in HMAC payload for x402 proof | MECHANICAL | P1 completeness | Prevents TTL forgery with minimal change | exp as separate field only |
| 19 | Canonicalize amount with `parseFloat(x).toFixed(6)` before HMAC | MECHANICAL | P1 completeness | Prevents same-value different-HMAC bugs | Raw string comparison |
| 20 | Add `@@unique([email])` to `GiveawayApplication` | MECHANICAL | P1 completeness | Idempotency guard — same pattern as safeTopUp's orderId | No unique constraint |
| 21 | Add X402_SECRET startup assertion in x402.ts | MECHANICAL | P5 explicit | Silent failure with empty secret = forgeable proofs | Runtime check per-call |
| 22 | Use `process.env.ADMIN_EMAIL` in giveaway admin route | MECHANICAL | P5 explicit | Hardcoded email breaks when team grows | Copy hardcoded pattern |
| 23 | Use `type = 2` (integer) not string in logs query | MECHANICAL | P5 explicit | New-API schema uses numeric type column | String 'completion' filter |
| 24 | Add `@@unique([email])` + null-guard + seed to GiveawayConfig | MECHANICAL | P1 completeness | One row pattern — findFirst returns null without seed | findFirstOrThrow |
| 25 | Admin approve must be idempotent: check `status != 'approved'` | MECHANICAL | P1 completeness | Double-approve = double $400 credit = fraud | No guard |
| 26 | Set `processedAt` on both approve and reject | MECHANICAL | P1 completeness | Incomplete audit trail | processedAt on approve only |
| 27 | Log x402 payments to ServiceUsage table | MECHANICAL | P1 completeness | Analytics blind spot without logging | No logging |
| 28 | Only intercept 402 with `X-Payment-Network: aporto` | MECHANICAL | P5 explicit | Non-aporto 402 must pass through unmodified | Intercept all 402s |
| 29 | Add in-memory rate limit on /api/giveaway/claim | MECHANICAL | P3 pragmatic | No rate limit = bot spam; in-memory is sufficient for MVP | No rate limit |
| 30 | GiveawayApplication.status must be validated at API layer | MECHANICAL | P5 explicit | Plain String column with no validation = silent corruption | Trust callers |
| 31 | GiveawayConfig: single-row table, seed in migration | MECHANICAL | P1 completeness | findFirst returns null on empty table = crash on page load | Seed manually |

---

## Updated File List (15 files)

### New Files (10)

| File | Purpose |
|------|---------|
| `prisma/migrations/YYYYMMDD_giveaway/migration.sql` | GiveawayApplication + GiveawayConfig tables + seed row |
| `src/app/giveaway/page.tsx` | 9-state landing page with 3-part progress indicator |
| `src/app/api/giveaway/claim/route.ts` | POST: verify eligibility → create GiveawayApplication |
| `src/app/api/admin/giveaway/route.ts` | GET list + POST approve/reject (admin-only) |
| `src/app/admin/giveaway/page.tsx` | Admin UI for reviewing applications |
| `src/lib/x402.ts` | `signX402Proof()` + `verifyX402Proof()` |
| `src/app/api/x402/pay/route.ts` | POST: deduct quota → sign proof → return token |
| `sdk/src/x402.ts` | `createX402Fetch()` interceptor |
| `src/lib/emails.ts` (add) | `sendGiveawayApprovalEmail()` template |
| `src/app/api/giveaway/status/route.ts` | GET: return current state + progress for /giveaway page |

### Modified Files (5)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add GiveawayApplication + GiveawayConfig models |
| `src/lib/newapi.ts` | Add `newApiGetGiveawayEligibility()` aggregation helper |
| `src/lib/serviceProxy.ts` | Fix TOCTOU race in `deductUserQuota()` |
| `sdk/src/index.ts` | Export `createX402Fetch` |
| `.env.example` | Add `X402_SECRET` |

---

## Test Coverage Map (26 codepaths → 15 missing)

```
Feature              Codepath                                    Test?
──────────────────── ──────────────────────────────────────────── ─────
Giveaway claim       happy path: qualified → pending              ❌
                     not authenticated                            ❌
                     already applied (P2002)                      ❌
                     not qualified (count < 25)                   ❌
                     not qualified (days < 3)                     ❌
                     not qualified (models < 2)                   ❌
                     quota filled (maxApprovals reached)          ❌
                     giveaway expired                             ❌
Admin approve        happy path: pending → approved + topup       ❌
                     double approve (idempotent)                  ❌
                     reject                                       ❌
deductUserQuota      happy path                                   ❌  (existing test coverage unclear)
                     concurrent requests (TOCTOU fix)             ❌
x402/pay             happy path                                   ❌
                     insufficient balance                         ❌
                     invalid network header                       ❌
                     expired proof (verifyX402Proof)              ❌
                     HMAC mismatch                                ❌
createX402Fetch      happy path: 402 → pay → retry → 200         ❌
                     non-aporto 402: pass through                 ❌
                     max_retries=1: second 402 returns error      ❌
                     non-402: pass through unmodified             ❌ (existing)
                     network error on /api/x402/pay               ❌
newApiGetGiveaway    query returns correct counts                 ❌
Eligibility          queryFailed=true on DB error                 ❌
signX402Proof        different amounts same canonical value        ❌
```

15 of 26 are net-new test cases. None exist today.

---

## Failure Modes Registry

| Failure | Impact | Mitigation |
|---------|--------|-----------|
| New-API logs DB down at claim time | Claim blocked | `queryFailed: true` → return 503, user retries |
| GiveawayConfig row missing | Page crash (null ref) | Seed migration + null guard → show "coming soon" |
| X402_SECRET not set | All x402 proofs forgeable | Startup assertion → crash fast at deploy time |
| maxApprovals reached mid-request | Concurrent over-approvals | Check count inside transaction; UI shows "filled" |
| Admin double-approve | Double $400 credit | `status != 'approved'` condition on UPDATE |
| TOCTOU on deductUserQuota | Negative balance | Atomic `WHERE quota >= $1` UPDATE |
| Proof replay attack | Free API calls | 5-minute TTL enforced at verify time |
| Amount string mismatch | HMAC validation failure | Canonical `parseFloat.toFixed(6)` both sides |

---

## PHASE 3 COMPLETE

Claude subagent: 20 findings (5 critical, 6 high, 9 medium/low). 15 auto-decisions applied (D17–D31, all MECHANICAL). 0 taste decisions. Engineering completeness raised from 2/10 to 8/10. 15 missing test cases identified. TOCTOU fix and HMAC fix are the two highest-severity issues — both addressed in auto-decisions.

Passing to Phase 3.5.

---

# Phase 3.5: DX Review

*Codex: unavailable [subagent-only]*

## Developer Experience Scorecard

### TTHW (Time to Hello World)

| Step | Target | Risk |
|------|--------|------|
| Find giveaway page | <2 min (Twitter link → landing) | Low |
| Install SDK | <1 min (`npm install @aporto-tech/sdk`) | Low |
| Get API key | <3 min (dashboard signup → key copy) | Medium — signup flow not reviewed |
| First successful LLM request | <5 min | Low (OpenAI-compatible) |
| Understand qualification criteria | <1 min (progress bar visible) | Low (3-part indicator) |
| Total TTHW | **<12 min** | Acceptable |

### createX402Fetch TTHW

| Step | Target | Risk |
|------|--------|------|
| Find x402 docs | <3 min | Medium — docs not yet written |
| Understand what x402 does | <2 min | Low (1-sentence explanation) |
| `createX402Fetch` integration | <10 min | Low (drop-in fetch wrapper) |
| Total TTHW | **<15 min** | Acceptable |

---

## DX Findings (8 total)

**DX1 (HIGH): No docs for `createX402Fetch`**

The SDK ships a new API with no usage example, no explanation of what x402 is, no explanation of what Aporto's internal credits mean vs. real USDC. First developer to hit it is confused. Fix: add a `## x402 Payments` section to the SDK README before Sprint 2 ships.

**DX2 (HIGH): Proof verification spec not published**

External API operators need to know how to verify Aporto proof tokens. Without a published spec (even one page), `createX402Fetch` only works against services that already trust Aporto proofs — which is nobody yet. Fix: publish verification algorithm in docs at launch.

**DX3 (MEDIUM): Giveaway qualification criteria not shown until after login**

Anonymous visitors see "Make 25 requests across 3 days" but can't see their current progress without signing in. This is correct behavior, but the sign-in CTA must be front-and-center. Current design has `[Sign up →]` — verify this is the first call-to-action in the anonymous state.

**DX4 (MEDIUM): Error messages from `/api/giveaway/claim` are generic**

"Not qualified" without telling the developer which criterion they failed (requests/days/models) creates confusion. Return structured errors: `{ qualified: false, missing: ["days", "models"] }`.

**DX5 (MEDIUM): SDK `createX402Fetch` API name**

`createX402Fetch` is accurate but opaque to developers unfamiliar with x402. Consider exposing an alias `createAgentFetch` in the SDK — same function, friendlier name. Add note in SDK docs.

**DX6 (LOW): x402 payment errors surface as generic fetch errors**

If `/api/x402/pay` returns 402 (balance insufficient) or 500, the SDK currently propagates as an opaque error. Should throw a typed `AportoPaymentError` with `code: "INSUFFICIENT_BALANCE"` or `code: "PAY_FAILED"` so agent code can handle it.

**DX7 (LOW): Giveaway "pending" state email**

After claim submission, there's no confirmation email. Developer submits and wonders if it worked. Fix: send `sendGiveawaySubmissionEmail()` immediately on claim create — fire-and-forget, same pattern as topup confirmation.

**DX8 (LOW): Admin review UI shows raw userId, not email**

Admin needs to identify the developer. `newApiUserId: 1234` is useless. Show `email` from GiveawayApplication, which is already in the model.

---

## Developer Journey Map

```
Day 0 (acquisition)
  Twitter / HN link → aporto.tech/giveaway
  Anonymous state: hero + 3 steps + code snippet
  CTA: [Sign up →]

Day 0 (activation)
  Signup → email verify → dashboard
  Copy API key
  npm install @aporto-tech/sdk
  First LLM request → success
  Return to /giveaway → progress: 1/25 requests, 1/3 days, 1/2 models

Day 1–3 (engagement)
  Developer makes requests across days
  Progress bar updates on each /giveaway visit
  Day 3: 25+ requests, 3 days, 2+ models → qualified state

Day 3 (claim)
  [Submit Claim] → POST /api/giveaway/claim → status: pending
  (DX7 fix: receive confirmation email)

Day 3–5 (review)
  Admin reviews application in /admin/giveaway
  Approve → $400 credit applied → approval email

Day 5+ (retention)
  Developer has $400 to spend
  Natural next step: connect more models, explore x402
```

---

## DX Auto-Decisions

| # | Decision | Classification | Principle |
|---|----------|----------------|-----------|
| 32 | Return structured qualification errors: `{qualified: false, missing: []}` | MECHANICAL | P1 completeness |
| 33 | Throw typed `AportoPaymentError` from createX402Fetch on pay failure | MECHANICAL | P5 explicit |
| 34 | Send `sendGiveawaySubmissionEmail()` on claim create (fire-and-forget) | MECHANICAL | P1 completeness |
| 35 | Show `email` not `newApiUserId` in admin giveaway UI | MECHANICAL | P5 explicit |

---

## PHASE 3.5 COMPLETE

8 DX findings (2 high, 3 medium, 3 low). 4 auto-decisions (D32–D35, all MECHANICAL). TTHW target: <12 min for giveaway, <15 min for x402. Biggest gap: docs for createX402Fetch and proof verification spec must ship with the feature.

Passing to Phase 4.

---

# Phase 4: Final Approval Gate

## Auto-Decisions Summary (D1–D35, all MECHANICAL)

All 35 decisions in this plan were classified MECHANICAL. No TASTE decisions were encountered — the design and engineering phases were structurally deterministic given the constraints (fraud prevention, money safety, idempotency, OpenAI compatibility, no blockchain).

The full decision audit trail is in the table above. No human override is required for any auto-decision.

## Open Taste Decisions (0)

None. No unresolved taste decisions.

## Challenges for User Review

Before approving, please confirm:

**C1: Giveaway threshold: 25 requests, ≥3 days, ≥2 models**
The plan raised this from the original "≥10 requests" to reduce fraud risk. If you want a lower bar to increase conversion, say so now. Recommended: keep at 25/3/2.

**C2: $400 credit value and budget cap**
`GiveawayConfig.maxApprovals = 100` means maximum liability is $40,000. If this is too high for the budget, set a lower default (e.g., 50 approvals = $20,000). The admin UI lets you change this at runtime.

**C3: x402 Sprint 2 scope**
Sprint 2 ships `createX402Fetch()` in the SDK + the backend `/api/x402/pay` endpoint + `src/lib/x402.ts`. Server-side x402 payee (Aporto itself accepting x402 payments) is Sprint 3 with a go/no-go gate. Confirm this sequencing is correct.

**C4: Sprint 3 go/no-go criteria**
Current proposal: ≥10 developers use `createX402Fetch()` in their code within 30 days of Sprint 2 launch → proceed with server-side x402. If you want a different metric (e.g., revenue threshold, specific partners), say so.

**C5: TOCTOU fix scope**
The TOCTOU fix in `deductUserQuota` (serviceProxy.ts) is included in Sprint 1. This is a security fix that affects all service proxy routes — not just x402. It should ship regardless of whether x402 ships. Confirm.

---

## Implementation Checklist

### Sprint 1: Giveaway (1–2 days CC + ~4h human review)

- [ ] Prisma migration: GiveawayApplication + GiveawayConfig + seed
- [ ] `src/lib/newapi.ts`: add `newApiGetGiveawayEligibility()`
- [ ] `src/lib/serviceProxy.ts`: fix TOCTOU in `deductUserQuota()`
- [ ] `src/app/giveaway/page.tsx`: 9-state machine + 3-part progress indicator
- [ ] `src/app/api/giveaway/status/route.ts`: GET current state + progress
- [ ] `src/app/api/giveaway/claim/route.ts`: POST claim with structured errors
- [ ] `src/app/api/admin/giveaway/route.ts`: admin list + approve/reject
- [ ] `src/app/admin/giveaway/page.tsx`: admin UI showing email + status
- [ ] `src/lib/emails.ts`: add `sendGiveawaySubmissionEmail()` + `sendGiveawayApprovalEmail()`
- [ ] Tests: 15 codepaths identified in Phase 3 test coverage map

### Sprint 2: x402 Client (1–2 days CC + ~2h human review)

- [ ] `src/lib/x402.ts`: `signX402Proof()` + `verifyX402Proof()` + startup assertion
- [ ] `src/app/api/x402/pay/route.ts`: auth → deduct → sign → return proof
- [ ] `sdk/src/x402.ts`: `createX402Fetch()` interceptor with typed `AportoPaymentError`
- [ ] `sdk/src/index.ts`: export `createX402Fetch`
- [ ] `.env.example`: add `X402_SECRET`
- [ ] SDK README: `## x402 Payments` section + proof verification spec
- [ ] Tests: x402 codepaths from Phase 3 test coverage map
- [ ] `src/lib/serviceProxy.ts`: log x402 payments to ServiceUsage (F17)

---

## PHASE 4 COMPLETE — AWAITING APPROVAL

**Plan status:** COMPLETE. Ready for implementation.

**Approve this plan to begin Sprint 1 implementation via `/ship`.**
