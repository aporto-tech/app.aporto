# @aporto-tech/sdk

The skill marketplace for AI agents. Discover thousands of capabilities by description, execute via smart provider routing, publish your own skills and earn — all through one API key.

## Install

```bash
npm install @aporto-tech/sdk
```

## LLM (OpenAI-compatible)

```typescript
import { AportoClient } from "@aporto-tech/sdk";

const aporto = new AportoClient({ apiKey: process.env.APORTO_API_KEY });

const chat = await aporto.llm.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});
```

Any OpenAI-compatible client works too — just set `baseURL`:

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.aporto.tech/v1",
  apiKey: "sk-live-YOUR_API_KEY",
});
```

## Web Search

```typescript
const results = await aporto.search.linkup({ query: "AI news" });
```

## Image Generation

```typescript
const img = await aporto.images.generate({ prompt: "a cat on the moon" });
```

## Text-to-Speech

```typescript
const audio = await aporto.audio.speech({ text: "Hello from Aporto!" });
```

## SMS

```typescript
await aporto.sms.send({ to: "+1234567890", message: "Your code: 1234" });
```

---

## Skill Routing

Discover and execute any skill in the Aporto marketplace. The routing layer does semantic search to find matching skills, then automatically selects the best provider by price, latency, and reliability.

```typescript
// Find skills matching a natural language query
const { skills } = await aporto.routing.discoverSkills({
  query: "convert text to speech",
});

// skills[0] = { id, name, description, category, capabilities, paramsSchema, similarity, ... }
console.log(skills[0].name);        // "Text to Speech"
console.log(skills[0].paramsSchema); // { text: "string", voice_id: "string", ... }

// Execute the best match
const result = await aporto.routing.executeSkill({
  skillId: skills[0].id,
  params: { text: "Hello from Aporto!", voice_id: "Rachel" },
  sessionId: "my-agent-session-123", // optional — enables retry deduplication
});

console.log(result.data); // MP3 audio / URL / JSON depending on skill
```

Filter by category or capability:

```typescript
const { skills } = await aporto.routing.discoverSkills({
  query: "generate image",
  category: "media/image",   // e.g. search/web, llm/chat, communication/sms
  capability: "generate",    // e.g. search, transcribe, convert, send
  page: 0,                   // paginate, 5 results per page
});
```

The `sessionId` parameter enables smart retry routing — if a provider fails, the next `executeSkill` call with the same `sessionId` will automatically route to a different provider.

---

## x402 Agent Payments

`createX402Fetch` lets your AI agent automatically pay for external API calls that require payment via the [x402 protocol](https://x402.org).

When the target API responds with `402 Payment Required` and `X-Payment-Network: aporto`, the SDK pays from your Aporto balance and retries the request. Your agent code doesn't change — just swap `fetch` for `createX402Fetch`.

```typescript
import { createX402Fetch } from "@aporto-tech/sdk";

const fetch = createX402Fetch({ apiKey: process.env.APORTO_API_KEY });

// If this API responds with 402 + x402 headers, the SDK pays automatically
const res = await fetch("https://some-x402-api.com/data");
const data = await res.json();
```

### Error handling

```typescript
import { createX402Fetch, AportoPaymentError } from "@aporto-tech/sdk";

const fetch = createX402Fetch({ apiKey: process.env.APORTO_API_KEY });

try {
  const res = await fetch("https://some-x402-api.com/data");
} catch (err) {
  if (err instanceof AportoPaymentError) {
    if (err.code === "INSUFFICIENT_BALANCE") {
      // top up at https://app.aporto.tech/dashboard
    }
    if (err.code === "PAY_FAILED") {
      // unexpected error from payment endpoint
    }
  }
}
```

### How it works

1. Agent calls `fetch(url)`
2. API responds `402` with headers:
   - `X-Payment-Network: aporto`
   - `X-Payment-Recipient: recipient@example.com`
   - `X-Payment-Amount: 0.001`
3. SDK posts to `https://app.aporto.tech/api/x402/pay` — Aporto deducts from your balance
4. SDK retries the original request with `X-Payment-Proof: v1.{ts}.{exp}.{userId}.{sig}`
5. External API verifies the proof (see below) and returns the data

Non-aporto 402 responses (e.g. from Stripe, billing systems) are passed through unchanged.

### For API operators: accepting x402 payments

To make your API accept Aporto x402 payments, respond to unauthenticated requests with:

```
HTTP/1.1 402 Payment Required
X-Payment-Network: aporto
X-Payment-Recipient: your-identifier
X-Payment-Amount: 0.001
```

Then verify the `X-Payment-Proof` header on the retry using Aporto's public verify endpoint:

```
GET https://app.aporto.tech/api/x402/verify
  ?proof=v1.{ts}.{exp}.{userId}.{sig}
  &network=aporto
  &recipient=your-identifier
  &amount=0.001
```

Response:
```json
{ "valid": true, "userId": 42 }
// or
{ "valid": false, "reason": "proof expired" }
```

Proof tokens are valid for 5 minutes and tied to a specific `network + recipient + amount` combination. Reusing a proof for a different amount or recipient will fail.
