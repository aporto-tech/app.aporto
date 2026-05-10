# MCP Skill Run Lifecycle Plan

Date: 2026-05-10

## Current State

Aporto now has the first version of a high-level skill run lifecycle.

Implemented:

- `SkillRun` database table and migration.
- `aporto_run_skill` MCP tool.
- `aporto_get_skill_run` MCP tool.
- REST equivalents:
  - `POST /api/routing/run`
  - `GET|POST /api/routing/runs/:id`
- Provider-aware discovery that includes active provider names and `syncConfig` in search text.
- Provider hint routing so explicit model/provider names like `nano banana`, `sora 2`, and `veo 3.1 720p` can influence provider selection.
- KIE async submit/poll flow through the existing Aporto provider wrapper.

Verified on production:

- `POST /api/routing/skills` returns `200`.
- Query `Google Nano Banana image generation` finds Nano Banana variants near the top.
- `POST /api/routing/runs/:id` returns `404 Skill run not found` for a fake run, which confirms the route is live and the `SkillRun` table exists.

Verified locally:

- `POST /api/routing/run` creates a `SkillRun`.
- `providerHint: "nano banana"` routes to `KIE - Google nano banana, text-to-image` after provider hint normalization and attribution guard.
- `POST /api/routing/runs/:id` can read an existing run and continue polling.

## Product Goal

Aporto should own the whole skill lifecycle for agents.

Agent expectation:

```text
User asks for a result.
Agent calls Aporto once with intent + params.
Aporto discovers the skill, chooses the provider, executes, waits when practical, stores artifacts, and returns either the final result or a runId with exact next step.
```

The agent should not need to know provider-specific task mechanics:

- KIE `recordInfo`
- Apify run/dataset polling
- verification `waiting` states
- cloud provisioning status endpoints
- arbitrary publisher webhook/polling contracts

## Why This Is Universal, Not Media-Specific

Media exposed the problem first because generation often returns `taskId`, but the same lifecycle applies to all non-trivial Aporto skills:

- Scrapers can return run ids and datasets later.
- SMS/email verification can enter `waiting` until the user acts.
- Email or phone enrichment can be queued by providers.
- DB/server provisioning can take minutes.
- Browser automation can be long-running.
- Third-party MCP providers may expose their own async contracts.

The fix is a generic `SkillRun` lifecycle and provider adapters, not a one-off media polling hack.

## Desired Universal Contract

Every high-level run should normalize to one of:

```ts
type SkillRunResult =
  | {
      status: "succeeded";
      runId: string;
      data: unknown;
      artifacts?: StoredArtifact[];
      costUSD?: number;
    }
  | {
      status: "running" | "waiting";
      runId: string;
      providerTaskId?: string;
      nextPollAt?: string;
      costUSD?: number;
    }
  | {
      status: "failed";
      runId: string;
      error: {
        code: string;
        message: string;
        cause?: string;
        retryable: boolean;
      };
    };
```

## Required Adapter Backlog

### 1. KIE Adapter Hardening

Status: first version exists.

Next work:

- Confirm final success path on production for image and video.
- Ensure `aporto_run_skill` can return final media URL when task completes inside wait budget.
- If task exceeds wait budget, ensure `aporto_get_skill_run` returns final result later.
- Add tests/evals for:
  - Nano Banana image
  - Sora 2 video
  - Veo 3.1 720p video
  - KIE failure state
  - KIE long-running state

### 2. Apify Adapter

Priority: high.

Why:

- Scrapers are core marketplace inventory.
- Apify actors often have run lifecycle + dataset output.

Required behavior:

- Submit actor run.
- Capture run id/default dataset id.
- Poll run status.
- Fetch dataset items when succeeded.
- Store JSON artifact.
- Store CSV artifact for tabular results.
- Return `running` if actor exceeds wait budget.

Likely files:

- `src/app/api/providers/apify/route.ts`
- `src/lib/skillRuns.ts`
- possibly new `src/lib/providerAdapters/apify.ts`

### 3. Verification Adapter

Priority: medium-high.

Covers:

- SMS verification
- WhatsApp verification
- email verification
- phone/email validation providers

Required states:

- `succeeded`: code sent, validation complete, or lookup complete.
- `waiting`: user action required, e.g. OTP code entry.
- `failed`: provider rejected or number/email invalid.

Important:

- Do not mark `waiting` as failure.
- Return exact next action expected from the agent/user.

### 4. Provisioning Adapter

Priority: medium.

Covers future skills:

- create database
- create server
- deploy app
- create storage bucket
- configure DNS

Required behavior:

- Return `running` while infrastructure is being provisioned.
- Poll provider status endpoint.
- Return final credentials/connection data only through secure artifact or redacted response.
- Make cancellation optional by provider capability.

Security requirements:

- Never expose internal provider keys.
- Store sensitive result fields with redaction rules before artifacts are written.

### 5. Generic HTTP Async Adapter

Priority: medium.

Purpose:

Support third-party publisher APIs without writing a custom adapter for each one.

Provider `syncConfig` should support:

```json
{
  "lifecycleMode": "sync | async_poll | async_webhook",
  "taskIdPath": "data.taskId",
  "statusEndpoint": "https://provider.example/status/{taskId}",
  "statusMethod": "GET",
  "statusPath": "data.status",
  "successValues": ["success", "succeeded", "completed"],
  "failureValues": ["failed", "error"],
  "resultPath": "data.result",
  "nextPollSeconds": 5
}
```

This lets publishers describe async behavior declaratively.

### 6. Webhook Callback Support

Priority: medium.

Need:

- Public callback endpoint for providers.
- Secure callback token/signature per run.
- Map callback to `SkillRun`.
- Store final result/artifacts.

Candidate route:

```text
POST /api/routing/runs/:id/callback
```

Security:

- Per-run secret or HMAC.
- Reject callbacks for wrong provider/run.
- Never trust provider-sent user id or skill id.

## Discovery And Routing Backlog

### Provider Metadata Search

Current implementation includes provider names and `syncConfig` in lexical search text.

Next:

- Add provider-level embeddings.
- Search `Skill + Provider` candidates together.
- Return suggested `providerHint` in discovery results when a provider variant matched strongly.

### Provider Hint Scoring

Current implementation normalizes hint text and provider metadata, then boosts matching providers.

Next:

- Add structured model aliases:
  - `nano banana` -> `google/nano-banana`
  - `nano banana 2` -> `google/nano-banana-2`
  - `sora 2` -> Sora providers
  - `veo 3.1 720p` -> Veo 720P providers
- Make explicit provider/model match override retry-diversity exclusion when the user clearly names a provider.

## Billing Backlog

Current state:

- Fixed `pricePerCall` and `costPerChar` are charged before provider call.
- Failed provider submit triggers refund.

Needed:

- Reserve balance for async run.
- Capture when provider accepts paid work.
- Refund policy for provider failure before work starts.
- Store final charge outcome on `SkillRun`.
- Avoid double charge when `aporto_get_skill_run` polls existing runs.

## Artifact Backlog

Current state:

- JSON artifacts are stored.
- Media URLs are copied to R2 when present.
- Tabular JSON gets CSV sidecar.

Needed:

- Better dataset support for scraper outputs.
- Redaction rules for provisioning credentials.
- Artifact retention visibility in run response.
- Partial results support for long-running scrapers.

## Observability Backlog

Need admin visibility:

- List recent `SkillRun` records.
- Filter by status, skill, provider, user, and error.
- Show raw provider payload with secret redaction.
- Show artifacts.
- Show stuck runs.

Suggested page:

```text
/admin/skill-runs
```

Suggested cron:

```text
POST /api/cron/reconcile-skill-runs
```

Purpose:

- Poll old `running` runs.
- Mark expired runs.
- Alert on stuck/error rates.

## Test And Eval Plan

Required smoke tests:

- `Google Nano Banana image generation` chooses `KIE - Google nano banana, text-to-image`.
- `Google Nano Banana image generation` returns final image URL or `running` + `runId`.
- `aporto_get_skill_run` eventually returns `succeeded` or a structured `failed`.
- `Google Veo 3.1 720p video generation` chooses a 720P Veo provider.
- `Sora 2 10s video generation` chooses Sora 2 provider if live.
- Existing sync search skill still returns final result.
- Existing SMS send still returns final result or provider error.
- Apify scraper returns JSON + CSV artifacts after adapter is added.
- Verification skill can return `waiting` without being treated as failed.
- Provisioning skill can return `running` and later `succeeded`.

Required non-regression checks:

- `npm run build`
- `npx prisma migrate deploy`
- production `POST /api/routing/skills`
- production `POST /api/routing/run`
- production `POST /api/routing/runs/:id`

## Implementation Order

1. Finish KIE production terminal-result verification.
2. Add Apify adapter.
3. Add generic HTTP async adapter.
4. Add verification adapter.
5. Add provisioning adapter.
6. Add webhook callback support.
7. Add provider-level embeddings.
8. Add admin `SkillRun` observability.
9. Add reconciliation cron for stuck runs.

## Decision Notes

- Keep `aporto_execute_skill` as a low-level escape hatch.
- Make `aporto_run_skill` the default tool for agents.
- Do not expose provider API keys to clients.
- Do not bypass Aporto provider wrappers from client-side callers.
- Server-side adapters may call internal provider wrappers or provider APIs, but auth boundaries must remain inside Aporto.
- A run that is still processing is not a failed run.
- The correct fallback for long tasks is `running` + `runId`, not raw `taskId`.
