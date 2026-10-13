# `@agentkey/sdk`

Builder-facing HTTP client for Agentkey **issue / resolve / verify**.

Verify transport and parse failures **fail closed** (`status: "error"`) — never soft-allow.

## Install (no npm publish)

From another repo (pnpm):

```bash
pnpm add "github:Rosh2403/AgentKey#main&path:packages/sdk"
```

Or in `package.json`:

```json
"@agentkey/sdk": "github:Rosh2403/AgentKey#main&path:packages/sdk"
```

The package is self-contained (no `@agentkey/*` workspace deps). TypeScript consumers can import the source entry directly.

## Usage

```ts
import { AgentkeyClient, agentKeys } from "@agentkey/sdk";

const client = new AgentkeyClient({ baseUrl: "http://127.0.0.1:8787" });
const keys = agentKeys.generate();
const agent = await client.issue({
  publicHandle: "demo-bot",
  publicKey: keys.publicKey,
});
const proof = agentKeys.createProof({
  agentId: agent.id,
  challenge: "pay-demo",
  privateKey: keys.privateKey,
});
const result = await client.verify({ agentId: agent.id, proof });
// result.status === "valid" | "invalid" | "unknown" | "revoked" | "error"
```
