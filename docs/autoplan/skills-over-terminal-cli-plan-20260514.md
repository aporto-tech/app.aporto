# Plan: Skills Over Terminal for Aporto Agents

Date: 2026-05-14
Branch: main
Status: draft for approval

## Summary

Add a terminal-first interface to the existing Aporto skill network so AI coding agents can discover and run 1000+ Aporto skills without per-client MCP configuration. This is not a replacement for MCP. It is a second transport over the same backend primitives: `discoverSkills()`, `runSkill()`, `getSkillRun()`, provider routing, billing, artifacts, and async polling.

The product promise:

```text
Give any AI coding agent 1000+ paid skills through one terminal command.
No MCP config. No provider API zoo. Aporto discovers, routes, bills, and returns artifacts.
```

## Decision

Build this inside the existing `@aporto-tech/sdk` package first, not as a new package.

Reason:
- The SDK already owns agent-facing Aporto access.
- The package already ships routing clients under `packages/sdk/src/modules/routing.ts`.
- Adding a `bin` entry gives users one install path: `npm install -g @aporto-tech/sdk`.
- A later separate package like `@aporto-tech/cli` can be split out only if CLI distribution becomes materially different from SDK distribution.

Working command name:

```bash
aporto
```

NPM package:

```bash
npm install -g @aporto-tech/sdk
```

If the binary name conflicts in npm/user environments, the fallback binary can be:

```bash
aporto-skill
```

## Existing Code Leverage

Already exists and should be reused:

- `src/lib/routing.ts`
  - `discoverSkills(query, page, filters)`
  - `selectProvider(skillId, sessionId, userId, paramsHash, isThirdParty, excludeProviderIds, providerHint)`
  - `executeSkillViaProvider(...)`
- `src/lib/skillRuns.ts`
  - `runSkill(...)`
  - `getSkillRun(...)`
  - async polling lifecycle
  - result artifact storage
  - cost reconciliation for KIE actual credits
- `src/app/api/mcp/route.ts`
  - `aporto_discover_skills`
  - `aporto_run_skill`
  - `aporto_get_skill_run`
- `src/app/api/routing/skills/route.ts`
  - REST discovery endpoint
- `src/app/api/routing/run/route.ts`
  - REST high-level skill runner
- `src/app/api/routing/runs/[id]/route.ts`
  - REST run polling endpoint
- `packages/sdk/src/modules/routing.ts`
  - current SDK discovery and legacy execute client

Main gap:

The SDK currently exposes `discoverSkills()` and legacy `executeSkill()`, but not the newer high-level `runSkill()` / `getSkillRun()` lifecycle that MCP already uses. The CLI should use the high-level run lifecycle, not the old sync execute endpoint.

## User Experience

### First setup

Preferred V1:

```bash
npm install -g @aporto-tech/sdk
export APORTO_API_KEY=sk-live-...
aporto skills search "generate a 5 second 720p video"
```

Optional V1.1:

```bash
aporto login
```

For V1, `login` can be deferred. Environment variable auth is simpler, scriptable, and better for agents.

### Agent-facing workflow

Discovery:

```bash
aporto discover "generate a 5 second 720p vertical video" --json
```

Run by chosen skill:

```bash
aporto run 76 \
  --params params.json \
  --provider auto \
  --wait \
  --json
```

Run by natural-language intent:

```bash
aporto run "generate a 5 second 720p vertical video" \
  --param prompt="Vertical TikTok-style UGC video..." \
  --wait \
  --json
```

Run with provider hint:

```bash
aporto run "generate a 5 second 720p vertical video" \
  --provider runway \
  --param prompt="Podcast interview shot..." \
  --wait \
  --json
```

Poll an async run:

```bash
aporto runs get <runId> --json
aporto runs wait <runId> --json
```

## CLI Command Shape

V1 commands:

```bash
aporto discover "<intent>" [--category media/video] [--capability generate] [--page 0] [--json]
aporto run "<skillId-or-intent>" [--provider <hint>] [--params params.json] [--param key=value] [--wait] [--max-wait 120] [--json]
aporto runs get <runId> [--json]
aporto runs wait <runId> [--max-wait 120] [--json]
```

Aliases:

```bash
aporto skills search "<intent>"
aporto skill run "<skillId-or-intent>"
```

V1 should not require stable slugs. It can accept numeric `skillId` immediately because discovery already returns IDs. Stable slugs are valuable, but not a blocker for the terminal-first MVP.

V1.1 should add stable slugs:

```bash
aporto run wan-2-7-text-to-video-720p-5s --params params.json --wait --json
```

## JSON Output Contract

All agent workflows should use `--json`.

Discovery output:

```json
{
  "success": true,
  "query": "generate a 5 second 720p vertical video",
  "page": 0,
  "skills": [
    {
      "skillId": 76,
      "name": "Wan Text-to-Video 2.7 720P 5s",
      "category": "media/video",
      "capabilities": ["generate"],
      "inputTypes": ["text"],
      "outputTypes": ["video"],
      "paramsSchema": {},
      "similarity": 0.86
    }
  ]
}
```

Run output:

```json
{
  "success": true,
  "status": "succeeded",
  "runId": "94913a16-19db-4019-81df-cef593bd8fbf",
  "skillId": 76,
  "skillName": "Wan Text-to-Video 2.7 720P 5s",
  "provider": "KIE - Wan 2.7 text-to-video 720p 5s",
  "costUSD": 0.6,
  "artifacts": [
    {
      "type": "video",
      "url": "https://..."
    }
  ],
  "data": {}
}
```

Needs-selection output:

```json
{
  "success": false,
  "status": "needs_selection",
  "message": "Multiple matching skills found. Choose one skillId and run again.",
  "choices": [
    {
      "skillId": 76,
      "name": "Wan Text-to-Video 2.7 720P 5s"
    }
  ]
}
```

## SDK Changes

Extend `packages/sdk/src/modules/routing.ts`:

- Add `runSkill(opts)`
- Add `getSkillRun(opts)`
- Add `waitSkillRun(opts)`
- Keep `executeSkill(opts)` for backwards compatibility

Proposed TypeScript API:

```ts
await aporto.routing.discoverSkills({
  query: "generate image with nano banana",
});

await aporto.routing.runSkill({
  intent: "generate image with nano banana",
  params: { prompt: "A clean product image..." },
  providerHint: "kie",
  waitForResult: true,
  maxWaitSeconds: 120,
});

await aporto.routing.getSkillRun({
  runId: "..."
});
```

Add CLI entry:

```json
{
  "bin": {
    "aporto": "./dist/cli.cjs"
  }
}
```

Implementation detail:

- Build CLI from `packages/sdk/src/cli.ts`.
- Use Node 18+ built-in `fetch`, `fs`, and `process`.
- Avoid heavy CLI dependencies in V1.
- Parse only the flags we need.

## Backend Changes

Minimal backend changes:

1. Ensure `/api/routing/run` accepts `providerHint`, `skillId`, `waitForResult`, `maxWaitSeconds`, and `sessionId`. This already exists.
2. Ensure `/api/routing/runs/[id]` returns the same shape as MCP `aporto_get_skill_run`. This appears to exist and should be verified.
3. Improve error JSON consistency so CLI can return actionable failures.

Optional V1.1 backend changes:

- Add `slug` to `Skill`.
- Add `slug` to `Provider`.
- Add endpoint to resolve slug to skill/provider.
- Add provider listing endpoint per skill.

Do not block V1 on slugs.

## Agent Instruction Snippet

Add this to docs and landing pages:

```md
When you need external AI capabilities, use Aporto CLI.

1. Discover the right skill:
   aporto discover "<what you need>" --json

2. Run the selected skill:
   aporto run <skillId> --params params.json --wait --json

Use --provider only when the user asks for a specific provider or model.
Prefer --json so you can read runId, costUSD, provider, and artifact URLs.
```

## Why This Solves the MCP Client Zoo

Classic MCP requires per-client config:

```text
Claude Code config != Cursor config != Cline config != OpenClaw config
```

Terminal-first requires only:

```text
Can the agent run shell commands?
```

That is true for nearly every coding agent.

The AI agent still uses Aporto discovery and routing. The only thing removed is the MCP config installation step.

## Pricing and Token Impact

This does not remove provider execution cost.

It does reduce LLM context overhead because the agent does not need 1000 tool schemas in context. It sees one small instruction and calls:

```bash
aporto discover ...
aporto run ...
```

This is a strong marketing claim:

```text
1000+ AI skills. Zero MCP config. Minimal context overhead.
```

## Acceptance Criteria

- `npm run build` passes at repo root.
- `npm run build` passes in `packages/sdk`.
- `aporto discover "nano banana image generation" --json` returns matching skills.
- `aporto run 76 --params params.json --wait --json` returns a `runId`, `provider`, `costUSD`, and artifact URL.
- `aporto run "<intent>" --provider runway --params params.json --wait --json` passes `providerHint` through to backend routing.
- `aporto runs get <runId> --json` returns current status.
- `aporto runs wait <runId> --json` polls until `succeeded`, `failed`, or timeout.
- Invalid auth returns a clear message: missing `APORTO_API_KEY` or unauthorized.
- Ambiguous skill intent returns `needs_selection` with choices and a concrete next command.

## Not In Scope for V1

- OAuth/browser login.
- Persistent local config file.
- Stable skill/provider slugs.
- Interactive command picker.
- Shell completions.
- Separate `@aporto-tech/cli` package.
- Provider marketplace pages.

## Open Questions for Approval

1. Binary name: `aporto` or `aporto-skill` fallback only if npm/bin conflict appears?
2. Install path: add CLI to existing `@aporto-tech/sdk` first?
3. V1 auth: `APORTO_API_KEY` only, with `aporto login` deferred?
4. V1 skill identity: numeric `skillId` first, slugs in V1.1?

## Recommended Answers

1. Use `aporto`.
2. Add to existing `@aporto-tech/sdk`.
3. Use `APORTO_API_KEY` in V1.
4. Use numeric `skillId` in V1, add slugs after the CLI proves usage.

## Implementation Steps After Approval

1. Extend SDK routing module with `runSkill`, `getSkillRun`, and `waitSkillRun`.
2. Add `packages/sdk/src/cli.ts`.
3. Add `bin.aporto` to `packages/sdk/package.json`.
4. Add README examples for agent workflows.
5. Add a short root docs page: "Aporto CLI for AI agents".
6. Build SDK and repo.
7. Test against local or production `appBaseUrl` with a real API key.

