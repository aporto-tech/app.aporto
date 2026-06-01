<!-- /autoplan restore point: new plan file created from existing docs; no prior file state -->
# Aporto KIE Async Endpoints and Repository Integration Referrals Plan

Date: 2026-06-01
Base branch: `main`
Source plans:

- `docs/autoplan/mcp-skill-run-lifecycle-20260510.md`
- `docs/repo-integration-referrals-mvp-20260601.md`

## Goal

Expand Aporto's existing KIE provider wrapper and `SkillRun` lifecycle so KIE async APIs work as first-class Aporto endpoints, while also adding repository-level integration attribution so open-source/template owners can earn from downstream paid usage.

This keeps responsibilities split:

- NewAPI remains the OpenAI-compatible gateway for standard synchronous/streaming LLM traffic.
- Aporto `providers/kie` + `SkillRun` owns KIE async task APIs that return provider task ids.
- Aporto-owned LLM gateway sits in front of NewAPI for repo integration attribution on LLM usage and strips internal headers before any provider call.

## Current State

Implemented today:

- `src/app/api/providers/kie/route.ts` wraps KIE media task APIs.
- `src/app/api/providers/kie-llm/route.ts` wraps KIE LLM-like provider calls.
- `src/lib/skillRuns.ts` has `SkillRun`, async polling, KIE adapter, Apify adapter, artifact storage, billing adjustment, and cron polling.
- `POST /api/routing/run` starts a high-level run.
- `GET|POST /api/routing/runs/:id` reads or continues a run.
- `POST /api/cron/skill-runs/poll` polls due async runs.
- SDK already exposes `routing.runSkill`, `routing.getSkillRun`, and `routing.waitSkillRun`.
- Publisher revenue exists for skill owners through `Publisher`, `SkillRevenue`, and payout admin pages.
- Provider attribution exists for provider-specific referrals through `ProviderAttribution`, but that model is not the right primitive for repository integration usage.

## Non-Goals

- Do not turn NewAPI into a generic job orchestrator.
- Do not force async KIE media/task endpoints into OpenAI-compatible response shapes.
- Do not pass repo integration metadata to external LLM providers.
- Do not expose downstream user prompts or request bodies to repository owners.
- Do not implement multi-level referral trees.
- Do not require GitHub verification before MVP usage tracking, though payouts should be gated by verification or admin approval.

## Architecture

### KIE Async Path

```txt
SDK / CLI / MCP / REST
  -> POST /api/routing/run
    -> select Provider with endpoint /api/providers/kie
    -> /api/providers/kie submits KIE createTask
    -> SkillRun stores providerTaskId and returns runId
  -> GET /api/routing/runs/:id or cron poll
    -> KIE adapter calls KIE recordInfo
    -> final result copied to R2
    -> final cost reconciled
    -> SkillRun marked succeeded/failed
```

### Standard LLM Path

```txt
SDK / OpenAI-compatible client
  -> Aporto LLM Gateway
    -> validate paying Aporto user
    -> read X-Aporto-Integration-Id if present
    -> create internal attribution context
    -> strip Aporto-only headers
  -> NewAPI
  -> upstream LLM provider
```

NewAPI can still contain standard providers/channels, including KIE endpoints that behave like synchronous OpenAI-compatible LLM endpoints. It should not own async media/job lifecycle.

## KIE Async MVP

### Public API Contract

Use existing high-level run API:

```http
POST /api/routing/run
Authorization: Bearer sk_...
Content-Type: application/json

{
  "intent": "nano banana image generation",
  "params": {
    "prompt": "product photo on white background"
  },
  "waitForResult": false
}
```

Immediate async response:

```json
{
  "success": true,
  "status": "running",
  "runId": "run_...",
  "skillId": 123,
  "provider": "KIE - Google Nano Banana",
  "providerTaskId": "task_...",
  "nextPollAt": "2026-06-01T12:00:05.000Z",
  "costUSD": 0.04
}
```

Status read:

```http
GET /api/routing/runs/run_...?waitForResult=false
Authorization: Bearer sk_...
```

Final response:

```json
{
  "status": "succeeded",
  "runId": "run_...",
  "data": {},
  "artifact": {
    "type": "image",
    "url": "https://..."
  },
  "artifacts": []
}
```

### KIE Provider Config

Provider rows continue to use `Provider.syncConfig`:

```json
{
  "requestType": "jobs.createTask",
  "apiPath": "/api/v1/jobs/createTask",
  "model": "google/nano-banana",
  "inputDefaults": {
    "aspectRatio": "1:1"
  },
  "pricing": {
    "type": "kieCredits",
    "creditToUSD": 0.005
  }
}
```

Extend `syncConfig` only where needed:

```json
{
  "statusApiPath": "/api/v1/jobs/recordInfo",
  "taskIdPath": "data.taskId",
  "statusPath": "data.status",
  "successValues": ["SUCCESS", "SUCCEEDED", "COMPLETED"],
  "failureValues": ["FAILED", "ERROR"],
  "resultPath": "data"
}
```

Hard-coded KIE exceptions should move toward config where practical, but not block MVP if only 1-2 endpoints differ.

### Required KIE Work

- Inventory current KIE async products and their submit/status endpoints.
- Add missing provider configs for required KIE endpoints.
- Harden `src/app/api/providers/kie/route.ts` for endpoint-specific request shapes.
- Extend `normalizeKieCreateTaskInput` rules for new models.
- Extend `kieAsyncAdapter` if new status payload shapes differ from current `recordInfo`.
- Add a config-driven status endpoint override instead of only checking `/api/v1/veo/generate`.
- Ensure artifact extraction catches image, audio, and video URLs in nested KIE responses.
- Ensure failed KIE payloads refund user balance and mark providers correctly.
- Ensure cron polling handles long-running KIE tasks without duplicate finalization.

### KIE Test Matrix

Minimum cases:

- Nano Banana text-to-image succeeds.
- Nano Banana edit/image-to-image succeeds.
- Sora 2 text-to-video returns running, then succeeds.
- Veo endpoint with non-standard status path succeeds.
- KIE returns provider validation error and no retry storm occurs.
- KIE returns transient error and retry policy behaves correctly.
- Polling after timeout does not start a duplicate provider task.
- Artifact URLs are copied to R2 and original temporary KIE URLs are not the only final output.
- Billing estimate is adjusted to actual KIE credits when available.
- Failed async KIE task refunds charged balance/promo amount.

## Repository Integration Referrals MVP

### Product Contract

Repository owner registers an integration:

```bash
aporto integrations create \
  --repo https://github.com/acme/nano-banana-agent \
  --name "Nano Banana Agent"
```

Repository code includes a public opaque id:

```ts
const aporto = new AportoClient({
  apiKey: process.env.APORTO_API_KEY,
  integrationId: "ri_acme_nano_banana_agent",
});
```

Downstream user supplies their own `APORTO_API_KEY`. The repository owner never sees user keys and does not proxy requests.

### Attribution Transport

SDK/CLI/MCP attach:

```http
X-Aporto-Integration-Id: ri_...
```

MCP config:

```json
{
  "mcpServers": {
    "aporto": {
      "url": "https://app.aporto.tech/api/mcp",
      "headers": {
        "Authorization": "Bearer ${APORTO_API_KEY}",
        "X-Aporto-Integration-Id": "ri_acme_nano_banana_agent"
      }
    }
  }
}
```

Header wins over `?integration_id=...`.

### Privacy Boundary

Aporto-only headers must be stripped before NewAPI or any external provider:

- `X-Aporto-Integration-Id`
- `X-Aporto-Repo`
- `X-Aporto-Referral`
- `X-Aporto-Publisher-Id`
- `X-Agent-Name`, unless intentionally retained inside Aporto only

Integration ids must never be placed into prompt/messages/body.

### Data Model

Add repository integration records:

```prisma
model RepoIntegration {
  id            String   @id @default(cuid())
  publisherId   String
  publicId      String   @unique
  name          String
  repoUrl       String?
  status        String   @default("pending")
  revenueShare  Float    @default(0.20)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  publisher     Publisher @relation(fields: [publisherId], references: [id])

  @@index([publisherId])
  @@index([status])
}
```

Add revenue records:

```prisma
model RepoIntegrationRevenue {
  id                String   @id @default(cuid())
  integrationId     String
  newApiUserId      Int
  requestId         String?
  skillCallId       Int?
  skillRunId        String?
  model             String?
  grossUSD          Float
  providerCostUSD   Float?
  netUSD            Float?
  revenueShare      Float
  earningUSD        Float
  paidOut           Boolean  @default(false)
  paidOutAt         DateTime?
  createdAt         DateTime @default(now())

  @@index([integrationId, createdAt])
  @@index([integrationId, paidOut])
  @@index([newApiUserId, createdAt])
}
```

The implementation can split LLM attribution and skill-run attribution if exact NewAPI reconciliation requires a staging table.

### Earnings Rules

- Pay only on successful paid usage.
- Do not pay on anonymous trials.
- Do not pay on free/promo-covered usage in MVP.
- Do not pay when the payer owns the integration.
- Integration must be active/approved.
- Unknown or invalid integration id must not fail the user request.
- Default earning: `max(grossUSD - providerCostUSD, 0) * 0.20`.

## Implementation Phases

### Phase 1: KIE Async Hardening

- Add KIE endpoint inventory doc or script output.
- Add missing `syncConfig` fields for new KIE endpoints.
- Extend `/api/providers/kie` request building and response parsing.
- Add config-driven status endpoint selection in `skillRuns.ts`.
- Add tests around status normalization, task id extraction, billing adjustment, and artifact extraction.

### Phase 2: Repo Integration Schema and Publisher UI

- Add Prisma models and migrations.
- Add publisher APIs to create/list repository integrations.
- Add admin controls to approve/suspend integrations and override share.
- Add publisher dashboard page or section with copy-paste snippets.

### Phase 3: Attribution Transport

- Add `integrationId` to SDK options and `APORTO_INTEGRATION_ID` env fallback.
- Add CLI `--integration` and env support.
- Add MCP header/query extraction.
- Add integration context to `routing/run` and `SkillRun` so KIE async usage can earn too.

### Phase 4: Aporto LLM Gateway

- Put Aporto-owned gateway in front of NewAPI for OpenAI-compatible LLM routes.
- Capture integration context.
- Strip Aporto-only headers before NewAPI/upstream.
- Preserve streaming.
- Add tests with a fake upstream proving forbidden headers never cross the boundary.

### Phase 5: Revenue Accounting

- Record repository integration revenue for successful skill calls/runs.
- Reconcile LLM usage from NewAPI logs or gateway request ids.
- Exclude self-usage and free usage.
- Add publisher earnings view and admin payout readiness.

## Affected Files

Likely implementation files:

- `src/app/api/providers/kie/route.ts`
- `src/lib/skillRuns.ts`
- `src/lib/kieModelRules.ts`
- `src/lib/kie-model-rules.json`
- `src/lib/routing.ts`
- `src/app/api/routing/run/route.ts`
- `src/app/api/routing/runs/[id]/route.ts`
- `src/app/api/mcp/route.ts`
- `packages/sdk/src/index.ts`
- `packages/sdk/src/modules/http.ts`
- `packages/sdk/src/modules/llm.ts`
- `packages/sdk/src/modules/routing.ts`
- `packages/sdk/src/cli.ts`
- `prisma/schema.prisma`
- new migration under `prisma/migrations`
- publisher dashboard pages under `src/app/publisher`
- admin page/API additions under `src/app/admin` and `src/app/api/admin`

## Success Criteria

- A developer can call a KIE async model through Aporto and receives a stable `runId` immediately.
- The same run can be polled through REST, SDK, CLI, and MCP.
- Final media artifacts are stored by Aporto, not left as only temporary provider URLs.
- NewAPI is not responsible for KIE async jobs.
- A repo integration id attached in SDK/CLI/MCP credits paid usage to the repository owner.
- No integration/referral metadata reaches external LLM providers.
- Unknown/suspended integration ids do not break user traffic.
- Tests cover KIE async success/failure/long-running paths and attribution header stripping.

## Decisions Already Made

| Decision | Status | Rationale |
|---|---|---|
| Keep async KIE out of NewAPI | Accepted | NewAPI fits OpenAI-compatible sync/stream traffic, not task lifecycle orchestration. |
| Use `providers/kie` + `SkillRun` adapter for KIE async | Accepted | Existing code already supports task id capture, polling, artifact storage, and billing adjustment. |
| Use Aporto-owned LLM gateway before NewAPI for repo attribution | Accepted | Aporto must own the privacy boundary and strip internal headers before NewAPI/provider routing. |
| Pay repo integrations from net margin by default | Accepted | Avoids negative unit economics on expensive providers. |
| Public integration id is opaque and non-secret | Accepted | It must be safe to commit into open-source repositories. |

## Open Questions

- Which exact KIE endpoints/models are required for the first expansion batch?
- Does every target KIE endpoint expose final cost/credits in poll result?
- Should repo integration earnings apply to KIE async skill runs in MVP or LLM usage first?
- Should repo verification be required before usage tracking or only before payout?
- Should `X-Agent-Name` be stripped before NewAPI or kept only inside Aporto gateway analytics?

## GSTACK REVIEW REPORT

Autoplan run date: 2026-06-01
Review mode: compressed local autoplan, because sandbox blocked normal `~/.gstack` telemetry/checkpoint writes and no subagent delegation was explicitly authorized.
Reviewed code paths:

- `src/app/api/providers/kie/route.ts`
- `src/lib/skillRuns.ts`
- `src/lib/routing.ts`
- `src/app/api/routing/run/route.ts`
- `src/app/api/mcp/route.ts`
- `packages/sdk/src/index.ts`
- `packages/sdk/src/modules/http.ts`
- `packages/sdk/src/modules/llm.ts`
- `packages/sdk/src/modules/routing.ts`
- `packages/sdk/src/cli.ts`
- `prisma/schema.prisma`
- existing plans in `docs/autoplan/mcp-skill-run-lifecycle-20260510.md` and `docs/repo-integration-referrals-mvp-20260601.md`

### Plan Summary

The plan is directionally right: KIE async endpoints should expand through the existing `providers/kie` + `SkillRun` lifecycle, while NewAPI remains for OpenAI-compatible LLM traffic. Repository integrations should be added as a separate attribution primitive, with an Aporto-owned LLM gateway in front of NewAPI to capture attribution and strip internal headers.

### CEO Review

Mode: SELECTIVE EXPANSION.

Premises accepted:

- KIE async job lifecycle is a product-level Aporto responsibility, not a NewAPI responsibility.
- Repository integration attribution is usage attribution, not signup referral attribution.
- Privacy boundary must be owned by Aporto before requests reach NewAPI or upstream providers.
- Existing publisher payout primitives should be reused instead of building a separate affiliate system.

Strategic findings:

| Finding | Severity | Decision | Rationale |
|---|---:|---|---|
| Repo attribution should apply to both LLM gateway usage and Aporto skill runs, but not necessarily in the first implementation slice. | Medium | Stage it: LLM gateway first, KIE/SkillRun attribution in same schema with delayed activation if needed. | The user's repository use case can call both LLM and KIE media models. The schema should not make the second path a later migration. |
| GitHub repo verification should not block usage tracking, but should gate payouts or approval. | Medium | Keep tracking before verification, require approval/verification before payout. | This avoids launch friction while preventing fake ownership payouts. |
| "KIE endpoint expansion" needs a named first batch before implementation starts. | High | Add endpoint inventory as Phase 1 prerequisite. | Without a target batch, implementation can drift into generic adapter work and miss the actual models users need. |

What is not in scope:

- Generic NewAPI async job support.
- Multi-level referrals.
- Automatic package detection from `package.json`.
- GitHub OAuth verification before MVP creation.
- Provider-visible attribution metadata.

### Design Review

UI scope: yes, but limited to publisher/admin dashboards.

Design findings:

| Area | Score | Required fix before implementation |
|---|---:|---|
| Publisher integration setup | 7/10 | Add copy-paste SDK, CLI, and MCP snippets directly on the integration detail page. |
| Earnings visibility | 6/10 | Show estimated, payable, and paid earnings separately. Do not make one ambiguous "earnings" number. |
| Admin review | 7/10 | Admin needs status, repo URL, publisher, revenue share, suspicious usage count, and payout eligibility in one scan-friendly table. |
| Privacy UX | 5/10 | Publisher UI must state that prompts, downstream users, and API keys are not visible to the repository owner. |

No landing page or marketing UI is needed. This is operational UI inside existing publisher/admin surfaces.

### Engineering Review

Architecture graph:

```txt
SDK/CLI/MCP
  |-- routing.runSkill / aporto_run_skill
  |     -> /api/routing/run
  |        -> selectProvider()
  |        -> executeSkillViaProvider()
  |        -> /api/providers/kie
  |        -> SkillRun(providerTaskId, lifecycleMode=async_poll)
  |        -> /api/routing/runs/:id OR cron poll
  |        -> kieAsyncAdapter.poll()
  |        -> storeSkillResultArtifacts()
  |        -> SkillRevenue + RepoIntegrationRevenue
  |
  |-- llm.chat.completions
        -> Aporto LLM Gateway
        -> attribution capture + header strip
        -> NewAPI
        -> upstream LLM provider
```

Engineering findings:

| Finding | Severity | Fix |
|---|---:|---|
| `kieAsyncAdapter` currently hard-codes the Veo status endpoint special case. | High | Add `statusApiPath`/poll config in `Provider.syncConfig` and make hard-coded fallback only a compatibility path. |
| `executeSkillViaProvider` merges all `syncConfig` into provider request body. | High | Keep provider-only lifecycle config out of KIE request bodies, or ensure `/api/providers/kie` destructures/removes every internal key before upstream. |
| Attribution context needs to survive async runs. | High | Add integration id/request context to `SkillRun` or a side table at run creation, not only at final billing. |
| Revenue reconciliation differs for SkillRun vs NewAPI LLM usage. | High | Use one public `RepoIntegration` model, but allow separate revenue writers for `SkillCall/SkillRun` and NewAPI log reconciliation. |
| There is no visible test harness for lifecycle code. | High | Add unit-level tests or scriptable assertions for KIE normalization, task id extraction, status normalization, billing adjustment, and header stripping. |
| Existing providerSecret fallback can forward caller auth if providerSecret is missing. | Medium | For any new external KIE/provider rows, require `providerSecret`; add audit check before enabling. |
| Cron polling can finalize long-running tasks, but duplicate finalization/idempotency must be explicit. | Medium | Make `RepoIntegrationRevenue` unique by `skillCallId` or `requestId` where available. |

Failure modes registry:

| Failure mode | User impact | Mitigation |
|---|---|---|
| KIE submit succeeds but status endpoint path is wrong. | User sees run stuck in `running`. | Config-driven `statusApiPath`, endpoint inventory, and failing poll test. |
| KIE final response shape differs from known `recordInfo`. | Final media never stored or billing never adjusts. | Per-endpoint status/result path config and normalization tests. |
| Attribution header leaks to NewAPI/upstream provider. | Privacy breach and provider-visible referral metadata. | Dedicated gateway strip test with fake upstream capture. |
| Unknown integration id fails paid user request. | Repository users get broken LLM/KIE calls because attribution config is stale. | Treat invalid attribution as no-op and log warning internally. |
| Async run earns twice due to cron + user polling race. | Overpays repo owner and corrupts earnings. | Unique revenue key and idempotent finalization. |
| Free/promo usage generates earnings. | Negative economics. | Revenue writer must require positive balance-charged usage. |

Test plan:

| Codepath | Test type | Required checks |
|---|---|---|
| `normalizeKieCreateTaskInput` | Unit | Alias, defaults, key removals, numeric coercion for new KIE models. |
| KIE createTask wrapper | Unit/integration with mocked fetch | Provider-only config is not forwarded to KIE body. |
| `kieAsyncAdapter` | Unit | Task id extraction, status path override, success/failure/running normalization. |
| `waitForProviderResult` | Unit/integration with mocked adapter | Refund on failure, cost adjustment on success, no double finalization. |
| Aporto LLM Gateway | Integration with fake upstream | `X-Aporto-*` headers stripped, streaming preserved. |
| SDK headers | Unit/build-level | Constructor and env `integrationId` become Aporto headers only. |
| MCP attribution | Route-level | Header and query extraction, header wins, invalid id no-op. |
| Revenue writer | Unit | Self-usage excluded, promo/free excluded, duplicate request id ignored. |

### DX Review

Developer-facing scope: yes.

Developer journey:

| Stage | Desired developer experience |
|---|---|
| Repository owner creates integration | One command or publisher UI action returns `ri_...`. |
| Repository owner installs SDK/MCP config | Copy-paste snippet works without understanding billing internals. |
| Downstream user runs repo | User only supplies `APORTO_API_KEY`; attribution is already embedded. |
| Downstream user calls KIE async model | User gets `runId` immediately and can poll from SDK/CLI/MCP. |
| Run completes | Final Aporto-hosted artifact URL is returned. |
| Repo owner checks earnings | Dashboard shows estimated/payable/paid without prompts or user keys. |
| Something fails | Error says whether the issue is auth, balance, KIE validation, provider running, or provider failed. |

DX findings:

| Finding | Severity | Fix |
|---|---:|---|
| SDK currently defaults LLM traffic straight to `https://api.aporto.tech/v1`. | High | The integration MVP must either change default LLM base URL to Aporto gateway or document that attribution requires the new gateway URL. |
| CLI examples currently cover skill run but not LLM model calls. | Medium | Add LLM and KIE async examples with `APORTO_INTEGRATION_ID`. |
| Async KIE contract must be first-class in SDK docs. | Medium | Document `runSkill`, `getSkillRun`, and `waitSkillRun` as the blessed async API. |
| Publisher snippets need to be safe for public repos. | Medium | Explicitly label `integrationId` public and `APORTO_API_KEY` user-owned secret. |

TTHW target:

- Repository owner creates integration and copies SDK snippet: under 3 minutes.
- Downstream user runs a KIE async example with own key: under 5 minutes.

### Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|---|---|---|---|---|---|
| 1 | CEO | Keep KIE async outside NewAPI | Mechanical | Explicit over clever | NewAPI does sync/stream LLM well; task lifecycle needs `SkillRun`. | Custom NewAPI async adapter |
| 2 | CEO | Use one repo integration model for LLM and SkillRun usage | Mechanical | Completeness | The same repo can call both LLM and KIE media models. | LLM-only schema |
| 3 | Eng | Add config-driven KIE status endpoints | Mechanical | DRY | Avoid growing hard-coded endpoint exceptions in `skillRuns.ts`. | More special cases |
| 4 | Eng | Require header strip test before gateway ships | Mechanical | Completeness | Privacy boundary is the central promise of the referral system. | Manual inspection only |
| 5 | Eng | Make repo revenue idempotent | Mechanical | Pragmatic | Cron and user polling can race on async finalization. | Best-effort duplicate avoidance |
| 6 | DX | Make `integrationId` public and explicit | Mechanical | Explicit over clever | Repo owners need to commit it safely to open-source code. | Hidden auto-detection first |

### Review Scores

| Phase | Verdict | Score |
|---|---|---:|
| CEO | Direction approved with endpoint inventory prerequisite | 8/10 |
| Design | Operational UI enough for MVP, privacy copy required | 7/10 |
| Engineering | Architecture sound, needs idempotency/config/test hardening | 7/10 |
| DX | Strong developer concept, needs gateway URL and async docs clarity | 7/10 |

### Final Approval Gate

Recommended approval: approve with the fixes below folded into implementation.

Required before coding:

1. Pick the first KIE endpoint/model batch.
2. Decide whether repo earnings apply to KIE async in MVP or only LLM gateway first.
3. Decide whether payout verification is admin approval only or GitHub verification.

No user challenge is raised. The plan follows the user's stated direction.
