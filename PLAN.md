<!-- /autoplan restore point: /Users/igortkachenko/.gstack/projects/aporto-tech-app.aporto/main-autoplan-restore-20260421-112806.md -->

# Plan: Routing Alpha — One MCP Server, Thousands of Skills

**Date:** 2026-04-21
**Branch:** main
**Author:** igortkachenko

---

## Summary

Build the routing layer that makes Aporto a skill network, not just an LLM proxy. Two-level MCP routing: semantic skill discovery via pgvector + provider scoring by price/latency/retry. Extend the admin panel to manage skills and providers. Gate publisher self-service behind a waitlist — architecture built for when the gate opens.

---

## Premises

1. The existing MCP server (`src/app/api/mcp/route.ts`) has 6 hardcoded tools. The new routing tools run alongside them — no breaking change to existing users.
2. pgvector is already available in Supabase. OpenAI `text-embedding-3-small` generates 1536-dim vectors. Cost at current scale ~$0.13/month.
3. The admin panel today only manages promo codes. It needs a Skills + Providers section to seed the skill network.
4. Publisher self-service is coming but NOT in this alpha. The publish endpoint is admin-only for now. Publishers join a waitlist.
5. The MCP server is stateless (Next.js serverless). Session tracking for retry-routing uses the `sessionId` passed by the caller — it persists at the caller's discretion, not in server memory.
6. Embedding caching: skill embeddings computed once at publish time, stored in pgvector. Query embeddings cached in-process (Next.js module scope, TTL 60s).

---

## Architecture

```
Agent
  ↓ MCP: discover_skills(query, sessionId, page?)
[Level 1] embed(query) → pgvector cosine similarity → top-5 Skills
  ↓ Agent picks skill (or page++ → next 5)
[Level 2] execute_skill(skillId, sessionId, params)
  → score providers: 0.4*(1-normPrice) + 0.4*(1-normLatency) + 0.2*(1-retryRate)
  → exclude providers already used in this session (auto-retry fallback)
  → execute → return result
  ↓ feedback(skillCallId, latencyMs, success) — optional, improves routing over time
```

---

## Database Schema Changes

Add 4 models to `prisma/schema.prisma`:

```prisma
model Skill {
  id          Int        @id @default(autoincrement())
  name        String
  description String
  embedding   Unsupported("vector(1536)")?
  tags        String?    // JSON array for display/filtering
  isActive    Boolean    @default(true)
  publishedBy String?    // null = Aporto internal; userId = publisher (future)
  createdAt   DateTime   @default(now())
  providers   Provider[]
  calls       SkillCall[]
}

model Provider {
  id           Int        @id @default(autoincrement())
  skillId      Int
  skill        Skill      @relation(fields: [skillId], references: [id])
  name         String
  endpoint     String
  pricePerCall Float
  avgLatencyMs Int        @default(500)
  retryRate    Float      @default(0)
  isActive     Boolean    @default(true)
  createdAt    DateTime   @default(now())
  calls        SkillCall[]
}

model SkillCall {
  id         Int      @id @default(autoincrement())
  sessionId  String
  userId     Int
  skillId    Int
  providerId Int
  isRetry    Boolean  @default(false)
  latencyMs  Int?
  success    Boolean?
  costUSD    Float?
  createdAt  DateTime @default(now())

  skill      Skill    @relation(fields: [skillId], references: [id])
  provider   Provider @relation(fields: [providerId], references: [id])

  @@index([sessionId])
  @@index([userId])
}

model PublisherWaitlist {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  useCase   String?
  createdAt DateTime @default(now())
  approved  Boolean  @default(false)
}
```

---

## Files to Create / Modify

### Core routing library

**`src/lib/embeddings.ts`** (new)
- `embedQuery(text: string): Promise<number[]>`
- In-process LRU cache: Map with TTL 60s, max 500 entries

**`src/lib/routing.ts`** (new)
- `discoverSkills(query, sessionId, page)` — pgvector cosine similarity, 5 per page
- `selectProvider(skillId, sessionId)` — scoring + session-based exclusion
- `executeSkillViaProvider(provider, params)` — HTTP POST to provider.endpoint
- `updateProviderStats(providerId, latencyMs, success)` — EMA update

### MCP Server extension

**`src/app/api/mcp/route.ts`** (modify)

Add `discover_skills` and `execute_skill` tools to `buildMcpServer()`. Keep all 6 existing tools untouched.

### REST API

**`src/app/api/routing/skills/route.ts`** — POST discover
**`src/app/api/routing/execute/route.ts`** — POST execute
**`src/app/api/routing/feedback/route.ts`** — POST feedback (latency/success update)
**`src/app/api/skills/publish/route.ts`** — POST publish (admin-only, generates embedding)
**`src/app/api/waitlist/publishers/route.ts`** — POST join waitlist (public)

### Admin API

**`src/app/api/admin/skills/route.ts`** — GET list / POST create / PATCH update / DELETE deactivate
**`src/app/api/admin/providers/route.ts`** — CRUD providers per skill
**`src/app/api/admin/waitlist/route.ts`** — GET list / PATCH approve

### Admin Panel UI

**`src/app/admin/page.tsx`** (modify)

Add tabs: `Promo Codes | Skills | Providers | Publisher Waitlist`

- **Skills tab:** table — name, description preview, provider count, total calls, active toggle, edit/delete
- **Providers tab:** nested under selected skill — endpoint, price/call, avg latency, retry rate, active toggle
- **Waitlist tab:** email, use case, signup date, approve button

### Initial skill seed

**`prisma/seed-skills.ts`** (new)

Seed the existing 6 services as Skills with their current providers:
- Web Search (Linkup standard + deep variants as 2 providers)
- AI Search (You.com)
- SMS Send (Prelude)
- Image Generation (fal.ai — flux-schnell, flux-dev, flux-pro as 3 providers)
- Text to Speech (ElevenLabs)
- LLM Chat (Aporto gateway)

Provider endpoints are thin internal routes (`src/app/api/providers/[service]/route.ts`) wrapping existing service logic.

---

## Provider Scoring

```typescript
// Min-max normalize across all active providers for the skill
normPrice   = (p.pricePerCall - min) / (max - min)  // 0 = cheapest
normLatency = (p.avgLatencyMs - min) / (max - min)  // 0 = fastest

score = 0.4*(1-normPrice) + 0.4*(1-normLatency) + 0.2*(1-p.retryRate)

// If only 1 provider: always use it regardless of session history
```

---

## Acceptance Criteria

- `discover_skills("find recent AI news")` returns 5 relevant skills in <200ms
- `page=1` returns the next 5, not repeating the first 5
- Calling `execute_skill` twice with same `sessionId+skillId` → second call uses different provider (if >1 provider exists)
- MCP connects with: `npx @modelcontextprotocol/inspector https://app.aporto.tech/api/mcp`
- Admin can create/edit/delete skills and providers
- Publisher waitlist accepts signups

---

## NOT in scope (this alpha)

- Publisher self-service dashboard (waitlisted)
- Real-time provider stats dashboard
- Billing publishers via x402
- Streaming provider responses
- Provider circuit breakers

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|---------|
| 1 | CEO | Feedback endpoint deferred | Mechanical | P3 | No data to improve routing with 6 skills; build when N>10 | Keep in alpha |
| 2 | CEO | SkillCall.userId → rename to newApiUserId | Mechanical | P5 | Mirrors ServiceUsage; avoids ambiguity cuid string vs int | Keep as userId |
| 3 | CEO | Session exclusion must add createdAt filter + index | Mechanical | P1 | Without TTL, old sessions accumulate and slow query | No TTL |
| 4 | CEO | Provider scoring: build schema, trivial selection until N>1 | Mechanical | P5 | Min-max normalization meaningless with 1 provider | Full formula from day 1 |
| 5 | CEO | NEWAPI_ADMIN_KEY: flag as deploy blocker | Mechanical | P6 | Embeddings call Aporto gateway (NEWAPI_URL), not OpenAI directly; service key required | Assume present |
| 6 | CEO | pgvector: use prisma.$queryRawUnsafe | Mechanical | P5 | Prisma doesn't support vector() natively; mirrors existing pattern | ORM abstraction |
| 7 | CEO | Admin UI tabs (Skills/Providers/Waitlist): TASTE DECISION | Taste | — | Borderline: seed script sufficient for 6-skill alpha, but useful for demos | Build all or defer |
| 8 | CEO | Publisher waitlist endpoint: KEEP | Mechanical | P1 | Low effort, useful demand signal | Defer |
| 9 | Design | Skills + Providers → single master-detail tab | Mechanical | P5 | Separate Providers tab has no context without selected skill | Four flat tabs |
| 10 | Design | ADD loading/empty/error states for all 3 new tabs | Mechanical | P1 | Plan specifies zero states; must be explicit | Ship without states |
| 11 | Design | ADD "Manage Providers →" action column in Skills table | Mechanical | P5 | Row-click drill-down not discoverable; matches existing explicit buttons | Implicit click |
| 12 | Design | ADD confirmation modal on active toggle | Mechanical | P5 | Toggling inactive = immediate routing disruption; matches confirm() pattern | No confirmation |
| 13 | Design | Waitlist approve: show post-click state "Approved — will be contacted manually" | Mechanical | P5 | Prevents admin thinking nothing happened | Silent state change |
| 14 | Design | ADD skill creation form spec to plan | Mechanical | P1 | Fields + embedding-generation loading state unspecified | Leave to implementer |
| 15 | Design | State admin panel is desktop-only (min-width 1024px) | Mechanical | P5 | Prevents wasted time on mobile breakpoints | Responsive |
| 16 | Eng | SkillCall.userId Int → newApiUserId Int (no FK to User.id) | Mechanical | P5 | User.id is cuid String; newApiUserId is Int from NewAPI; matches ServiceUsage | Keep as userId |
| 17 | Eng | pgvector migration: hand-patch with ALTER TABLE + ivfflat index | Mechanical | P1 | Prisma generates empty body for Unsupported(); index required for perf | Trust prisma migrate |
| 18 | Eng | Delete module-scope embedding cache | Mechanical | P3 | Vercel serverless = near-zero hit rate; $0.002/month cost unworthy of complexity | Keep cache |
| 19 | Eng | CTE to merge provider fetch + session exclusion into 1 query | Mechanical | P5 | Reduces round-trips; explicit SQL is readable | Separate queries |
| 20 | Eng | Provider HTTP: AbortSignal.timeout(10s) + HTTPS-only + 1MB body cap | Mechanical | P1 | No timeout = Vercel hangs; SSRF via admin-controlled endpoint | Trust providers |
| 21 | Eng | EMA: alpha=0.2, null initial, guard max===min with 0.5 | Mechanical | P5 | Undefined alpha = unimplementable; 500ms default misleading; division by zero | Leave undefined |
| 22 | Eng | Centralize isAdmin() in src/lib/auth.ts | Mechanical | P5 | 6+ files would hardcode email; one-hour refactor | Hardcode again |
| 23 | Eng | sessionId exclusion: add AND newApiUserId = $3 | Mechanical | P1 | Without user scoping, session pollution possible | Global sessionId |
| 24 | Eng | Seed: Skill rows only; Provider rows inactive until wrapper routes built | Mechanical | P3 | /api/providers/[service] routes don't exist; active providers = broken execute_skill | Seed with active providers |
| 25 | Eng | updateProviderStats: fire-and-forget (don't await before response) | Mechanical | P5 | Stats write races serverless timeout = silent data loss | Await |
| 26 | DX | MCP tool names: aporto_discover_skills / aporto_execute_skill | Mechanical | P5 | Matches existing aporto_ prefix; agents get consistent namespace | discover_skills / execute_skill |
| 27 | DX | ADD paramsSchema JSON field to Skill model; return in discover_skills response | Mechanical | P1 | Without schema, agents can't know what params to pass to execute_skill | No schema |
| 28 | DX | sessionId: optional, document convention (e.g. "agent-{uuid}-{date}") | Mechanical | P5 | Required field adds friction; agents may not have one; document but don't enforce | Required field |
| 29 | DX | Remove feedback endpoint from files-to-create (already deferred in Decision #1) | Mechanical | P3 | Contradicts Decision #1; creates dead code and confusing docs | Keep in file list |
| 30 | Gate | USER OVERRIDE: build /api/providers/[service] wrapper routes in alpha | User | — | User chose complete end-to-end; overrides Decision #24 (providers inactive) | Seed providers inactive |
| 31 | Gate | Admin UI: build full Skills+Providers master-detail + Waitlist tabs | User | — | User chose full build; overrides taste decision #7 | Defer to seed script |

---

## SKILL CREATION FORM SPEC

Fields: `name` (text, required), `description` (textarea, required), `tags` (comma-separated text, optional), `paramsSchema` (JSON textarea, optional, placeholder: `{"query": "string", "maxResults": "number"}`).

On submit: POST `/api/admin/skills` → embedding generation in progress state: spinner + "Generating embedding..." (OpenAI call ~500ms). On success: row appears in table. Error state: red inline message.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | resolved | 2 CRITICAL → auto-decided, 3 HIGH → auto-decided, 3 MEDIUM → auto-decided |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | [codex-unavailable] | — |
| Design Review | `/plan-design-review` | UI completeness | 1 | resolved | 7 findings → all auto-decided |
| Eng Review | `/plan-eng-review` | Architecture & safety | 1 | resolved | 1 CRITICAL → auto-decided, 5 HIGH → auto-decided, 4 MEDIUM → auto-decided |
| DX Review | `/plan-devex-review` | Developer experience | 1 | resolved | 4 findings → all auto-decided |

**VERDICT:** APPROVED — IMPLEMENTATION IN PROGRESS
