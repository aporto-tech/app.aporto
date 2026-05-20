# @aporto-tech/sdk

One CLI command — 1000+ paid AI skills. Search, scraping, image generation, TTS, video, verification, automation, and 400+ LLM models. Pay per use. No vendor accounts.

## Quick Start

```bash
npm install -g @aporto-tech/sdk
export APORTO_API_KEY="sk-live-YOUR_KEY"   # get from https://app.aporto.tech/settings
```

## CLI Commands

### `aporto discover` — Find skills

```bash
aporto discover "generate image"

# 4    Image Generation              media/image    $0.0040/call
# 96   Image Generation Nano Banana  media/image    $0.0400/call
# 67   Image Generation Recraft      media/image    $0.0200/call

aporto discover "scrape website" --category data/scraping --json
```

| Flag | Description |
|------|-------------|
| `--category <val>` | Filter by category (e.g. `media/image`, `search/web`, `data/scraping`) |
| `--capability <val>` | Filter by capability (e.g. `generate`, `search`, `transcribe`) |
| `--page <n>` | Pagination (5 results per page) |
| `--json` | Structured JSON output |

### `aporto run` — Execute a skill

```bash
# By skill ID
aporto run 4 --param prompt="a cat on the moon" --wait

# By intent (auto-discovery)
aporto run "generate product video" \
  --param prompt="clean product launch teaser" \
  --provider auto \
  --wait

# With a local file
aporto run 42 \
  --file image=./product.jpg \
  --param prompt="Remove background" \
  --wait

# Complex params from JSON
aporto run 17 --params params.json --wait --json
```

| Flag | Description |
|------|-------------|
| `--param key=value` | Set a parameter (repeatable) |
| `--file key=path` | Attach a local file (repeatable, base64-encoded) |
| `--params <file.json>` | Load all parameters from a JSON file |
| `--provider <hint>` | Provider preference (name or `auto`) |
| `--wait` | Wait for completion before returning |
| `--no-wait` | Return immediately with runId |
| `--max-wait <sec>` | Max wait time (default: 600) |
| `--session <id>` | Session ID for retry deduplication |
| `--json` | Structured JSON output |

### `aporto runs get` / `aporto runs wait` — Poll async results

```bash
aporto runs get <runId> --json
aporto runs wait <runId> --timeout 600 --interval 10 --json
```

| Flag | Description |
|------|-------------|
| `--timeout <sec>` | Total timeout (default: 600) |
| `--interval <sec>` | Poll interval (default: 30) |
| `--max-wait <sec>` | Max wait per poll cycle |
| `--json` | Structured JSON output |

### `aporto help`

```bash
aporto help
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APORTO_API_KEY` | For `run` and paid commands. Optional for `discover`. | API key from [app.aporto.tech/settings](https://app.aporto.tech/settings) |
| `APORTO_BASE_URL` | No | Override base URL (default: `https://app.aporto.tech`) |

---

## TypeScript SDK

For programmatic use in applications:

```bash
npm install @aporto-tech/sdk
```

```typescript
import { AportoClient } from "@aporto-tech/sdk";

const aporto = new AportoClient({ apiKey: process.env.APORTO_API_KEY });

// Discover + run a skill
const { skills } = await aporto.routing.discoverSkills({ query: "generate image" });
const run = await aporto.routing.runSkill({
  intent: "generate image",
  params: { prompt: "a cat on the moon" },
  waitForResult: true,
});
console.log(run.artifacts?.[0]?.url);
```

### Convenience modules

```typescript
// LLM (OpenAI-compatible, 400+ models)
const chat = await aporto.llm.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});

// Image generation
const img = await aporto.images.generate({ prompt: "a cat on the moon" });

// Text-to-speech
const audio = await aporto.audio.speech({ text: "Hello from Aporto!" });

// Web search
const results = await aporto.search.linkup({ query: "AI news" });
```

Or use any OpenAI-compatible client:

```typescript
import OpenAI from "openai";
const client = new OpenAI({
  baseURL: "https://api.aporto.tech/v1",
  apiKey: "sk-live-YOUR_API_KEY",
});
```

---

## MCP Server (for AI agents)

Add Aporto to Claude Code, Cursor, Windsurf, or Codex:

```bash
claude mcp add --transport http aporto https://app.aporto.tech/api/mcp \
  --header "Authorization: Bearer $APORTO_API_KEY"
```

---

## x402 Agent Payments

Auto-pay for external APIs that support the [x402 protocol](https://x402.org):

```typescript
import { createX402Fetch } from "@aporto-tech/sdk";
const fetch = createX402Fetch({ apiKey: process.env.APORTO_API_KEY });
const res = await fetch("https://some-x402-api.com/data");
```

When an API responds `402 Payment Required` with `X-Payment-Network: aporto`, the SDK pays from your Aporto balance and retries automatically.

---

## Links

- [Dashboard](https://app.aporto.tech) — API keys, balance, usage logs
- [Full Documentation](https://docs.aporto.tech) — CLI reference, capabilities, integration guides
- [CLI Reference](https://docs.aporto.tech/cli-reference) — All commands and flags
