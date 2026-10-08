# Example: agent registers → third party verifies

Slice-0 stubs. Crypto attestation is not fully implemented; verify returns typed answers and **fails closed** on bad input / transport errors.

## 1. Start the API

```bash
pnpm install
pnpm --filter @agentkey/api dev
# http://127.0.0.1:8787
```

## 2. Agent registers (issue)

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/agents \
  -H 'content-type: application/json' \
  -d '{"publicHandle":"demo-bot","publicKey":"stub-pubkey-hex"}'
```

Response includes `id`, `publicHandle`, `privateSubject` (dual model), `issuerId: "agentkey:root"`.

Optional hybrid commit stub:

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/agents \
  -H 'content-type: application/json' \
  -d '{"publicHandle":"anchored-bot","publicKey":"stub","commitOnChain":true}'
```

## 3. Resolve (public by default)

```bash
curl -sS http://127.0.0.1:8787/v1/agents/demo-bot
# privateSubject omitted unless ?includePrivateSubject=true
```

## 4. Third party verifies

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/verify \
  -H 'content-type: application/json' \
  -d '{"agentId":"<id from step 2>","proof":"stub-proof"}'
```

- Missing/malformed input → `{ "status": "error", "reason": "…" }` (HTTP 400)
- Stub crypto (keys not configured) → `{ "status": "unknown", … }`
- Never soft-allows on failure

## SDK path

```ts
import { AgentkeyClient } from "@agentkey/sdk";

const ak = new AgentkeyClient({ baseUrl: "http://127.0.0.1:8787" });
const agent = await ak.issue({ publicHandle: "demo-bot", publicKey: "stub" });
const verdict = await ak.verify({ agentId: agent.id, proof: "stub-proof" });
console.log(verdict.status);
```
