# Repository Integration Referrals MVP

Date: 2026-06-01

## Goal

Let a repository owner earn revenue when downstream users run that repository's code and call Aporto-paid LLM/models/tools with their own Aporto API key.

This is usage attribution embedded in code, not a signup referral link. The user's API key pays for the request. The repository owner's public integration id is attached to Aporto requests so Aporto can credit the owner after successful paid usage.

Example repository code:

```ts
import { AportoClient } from "@aporto-tech/sdk";

const aporto = new AportoClient({
  apiKey: process.env.APORTO_API_KEY,
  integrationId: "ri_acme_nano_banana_agent",
});

const result = await aporto.llm.chat.completions.create({
  model: "google/nano-banana",
  messages: [{ role: "user", content: "Generate a prompt variant" }],
});
```

## Architecture Decision

Use Variant A: an Aporto-owned LLM gateway in front of NewAPI.

Request path:

```txt
SDK / CLI / MCP
  -> Aporto LLM Gateway
    - validates/identifies the paying user
    - reads X-Aporto-Integration-Id
    - records internal attribution context
    - strips all Aporto-only attribution headers
  -> NewAPI
  -> upstream LLM provider
```

Do not rely on NewAPI to strip arbitrary headers. Aporto must own the privacy boundary before any request can reach NewAPI/provider routing.

## Privacy Invariant

Integration/referral data must never reach LLM providers.

Allowed upstream provider request data:

- provider auth headers
- required OpenAI-compatible headers
- model request body supplied by the user

Forbidden upstream provider request data:

- `X-Aporto-Integration-Id`
- `X-Aporto-Repo`
- `X-Aporto-Referral`
- `X-Agent-Name`, unless intentionally needed and explicitly reviewed
- repo URL
- publisher id
- payout metadata
- attribution ids in prompt/messages/body

The public integration id should be opaque:

```txt
ri_8f3k2...
```

The mapping remains only in Aporto storage:

```txt
integrationId -> publisherId -> repoUrl -> payout account
```

## MVP Scope

### In Scope

- Publisher can create a repository integration.
- Integration gets a public opaque id.
- SDK can send integration attribution for LLM calls.
- CLI can send integration attribution through env/flag.
- MCP can send integration attribution through header/config.
- Aporto gateway records attribution for paid LLM usage.
- Aporto gateway strips attribution headers before forwarding to NewAPI.
- Backend calculates repository owner earnings for successful paid usage.
- Publisher dashboard can show integration usage and earnings.

### Out of Scope

- Signup attribution.
- Multi-level referrals.
- Automatic package/repo detection.
- GitHub ownership verification as a hard requirement.
- Provider-visible attribution.
- Passing repo URL in every request.
- Paying on anonymous trial usage.

## Data Model

Add a repository integration model:

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

Add usage/revenue records:

```prisma
model RepoIntegrationRevenue {
  id             String   @id @default(cuid())
  integrationId  String
  newApiUserId   Int
  requestId      String?
  model          String?
  grossUSD       Float
  providerCostUSD Float?
  netUSD         Float?
  revenueShare   Float
  earningUSD     Float
  paidOut        Boolean  @default(false)
  paidOutAt      DateTime?
  createdAt      DateTime @default(now())

  @@index([integrationId, createdAt])
  @@index([integrationId, paidOut])
  @@index([newApiUserId, createdAt])
}
```

If NewAPI logs already provide request ids/costs, use those ids. If not, the Aporto gateway should create a request id before forwarding and later reconcile against NewAPI usage logs.

## Attribution Rules

- Credit only successful paid usage.
- Do not credit anonymous trials.
- Do not credit free trial/promo-covered usage in MVP, unless explicitly configured later.
- Do not credit usage where the paying user owns the integration.
- Only active/approved integrations earn revenue.
- If `integrationId` is unknown, invalid, suspended, or malformed, continue the user request without attribution.
- The integration id is public, not secret.
- If another repo copies the same integration id, earnings still go to the original owner.

## Earnings Model

Recommended MVP: share of net margin.

```txt
grossUSD = amount billed to user
providerCostUSD = upstream provider cost
netUSD = grossUSD - providerCostUSD
earningUSD = max(netUSD, 0) * integration.revenueShare
```

Default MVP share:

```txt
20% of net margin
```

Reason: gross revenue share can push Aporto negative on high-cost models. Net margin share keeps economics bounded.

## SDK Changes

Add `integrationId` to `AportoClientOptions`:

```ts
export interface AportoClientOptions {
  apiKey: string;
  agentName?: string;
  integrationId?: string;
  appBaseUrl?: string;
  llmBaseUrl?: string;
}
```

For LLM calls, SDK should send:

```http
X-Aporto-Integration-Id: ri_...
```

For app-backed skill/service routes, use the same header so non-LLM usage can be credited in a later phase.

Also support env fallback:

```txt
APORTO_INTEGRATION_ID=ri_...
```

Explicit constructor value wins over env.

## CLI Changes

Support:

```bash
APORTO_INTEGRATION_ID=ri_acme_nano_banana_agent aporto run ...
```

and:

```bash
aporto run ... --integration ri_acme_nano_banana_agent
```

Add future publisher commands:

```bash
aporto integrations create --repo https://github.com/acme/nano-banana-agent --name "Nano Banana Agent"
aporto integrations list
aporto integrations stats ri_acme_nano_banana_agent
```

Publisher-management commands can come after dashboard API endpoints exist.

## MCP Changes

Support attribution through MCP client config:

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

Alternative query param can be supported for clients that cannot set custom headers:

```txt
https://app.aporto.tech/api/mcp?integration_id=ri_acme_nano_banana_agent
```

Header wins over query param.

## Gateway Requirements

The Aporto LLM Gateway must:

- accept OpenAI-compatible paths, starting with `/v1/chat/completions`;
- preserve streaming behavior;
- validate or pass through the user's Aporto API key to NewAPI;
- capture `X-Aporto-Integration-Id`;
- validate integration public id format;
- look up active integration metadata;
- create an internal request attribution record;
- strip Aporto-only headers before forwarding to NewAPI;
- return NewAPI/provider responses unchanged where possible;
- reconcile usage/cost after request completion.

Header strip list for MVP:

```txt
X-Aporto-Integration-Id
X-Aporto-Repo
X-Aporto-Referral
X-Aporto-Publisher-Id
```

Consider stripping `X-Agent-Name` from LLM upstream as well unless NewAPI needs it internally. If NewAPI needs it, consume it at gateway level and do not forward to providers.

## Dashboard Requirements

Publisher portal should show:

- create repository integration;
- integration public id;
- copy-paste SDK snippet;
- copy-paste MCP config snippet;
- total gross usage;
- estimated earnings;
- paid/unpaid earnings;
- recent usage rows by date/model, without exposing user prompts.

Do not show downstream user prompt/body content.

## Admin Requirements

Admin should be able to:

- approve/suspend integrations;
- override revenue share;
- inspect suspicious usage;
- mark revenue as paid out;
- see linked publisher and repo URL.

## Implementation Phases

### Phase 1: Data and Dashboard Skeleton

- Add Prisma models and migration.
- Add publisher APIs to create/list integrations.
- Add minimal dashboard page for integrations.
- Add admin status controls.

### Phase 2: SDK/CLI/MCP Attribution Transport

- Add `integrationId` option to SDK.
- Add `APORTO_INTEGRATION_ID` env support.
- Add CLI `--integration` flag.
- Add MCP header/query extraction.
- Add tests that headers are sent to Aporto endpoints.

### Phase 3: Aporto LLM Gateway

- Route SDK LLM base URL through Aporto-owned gateway.
- Gateway forwards clean requests to NewAPI.
- Add automated test proving attribution headers are stripped before upstream.
- Preserve streaming for chat completions.

### Phase 4: Revenue Accounting

- Record attribution events for successful paid LLM requests.
- Reconcile with NewAPI logs/costs.
- Calculate earnings from net margin.
- Exclude self-usage and free/trial usage.

### Phase 5: Reporting and Payout Readiness

- Dashboard earnings view.
- Admin review/export.
- Payout batching integration with existing publisher payout flow.

## Open Questions

- Should MVP support only LLM usage or all SDK/MCP paid service usage?
- Does NewAPI expose enough request/cost data for exact reconciliation, or do we need gateway-side metering?
- Should `X-Agent-Name` be kept internal for analytics and stripped before providers?
- What minimum payout threshold should apply to repo integration earnings?
- Should GitHub repo ownership verification be required before payouts, rather than before integration creation?

## Recommended Defaults

- MVP usage type: LLM only.
- Revenue share: 20% of net margin.
- Integration status: pending until admin approved.
- Attribution id: opaque public id, `ri_` prefix.
- Trial/promo usage: no earnings.
- Self-usage: no earnings.
- Privacy rule: attribution headers must be stripped before NewAPI/provider upstream.
