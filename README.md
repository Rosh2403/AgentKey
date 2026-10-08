# Agentkey

Portable, verifiable **agent identity** — unique Agent IDs that apps can **issue**, **resolve**, and **verify** with typed answers (`valid` | `invalid` | `unknown` | `revoked` | `error`). Verify **fails closed** on errors.

> Product name: **Agentkey** (also written AgentKey in prose).

## Locked design (slice-0)

| Decision | Choice |
| --- | --- |
| Issuer model | **A — Single root issuer** |
| Anchoring | **C — Hybrid** (off-chain default + optional on-chain commit) |
| ID visibility | **C — Dual** (public handle + private subject) |
| Language | **TypeScript** end-to-end now; Rust/Go protocol core later; Solidity registry only when needed |

## Monorepo layout

```
apps/
  api/                 # HTTP: POST /v1/agents, GET /v1/agents/{id}, POST /v1/verify
  mcp/                 # MCP tools: agentkey_issue | agentkey_resolve | agentkey_verify
packages/
  protocol/            # ID + verify types (TS now; Rust extract later)
  sdk/                 # Builder client
  crypto/              # Sign/verify helpers (thin stubs)
tooling/               # shared tsconfig
```

## Quick start

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @agentkey/api dev
```

Copy `.env.example` → `.env` locally. **Never commit secrets.**

## Minimal example path

1. **Agent registers** — `POST /v1/agents` with `publicHandle` + `publicKey` (optional `commitOnChain` for hybrid anchor stub).
2. **Third party verifies** — `POST /v1/verify` with `agentId` + `proof` → typed `VerifyResult` (errors → `status: "error"`, never soft-allow).

See [examples/register-and-verify.md](./examples/register-and-verify.md).

SDK sketch:

```ts
import { AgentkeyClient } from "@agentkey/sdk";

const client = new AgentkeyClient({ baseUrl: "http://127.0.0.1:8787" });
const agent = await client.issue({
  publicHandle: "my-bot",
  publicKey: "…",
});
const result = await client.verify({ agentId: agent.id, proof: "…" });
// result.status is typed; transport failures → error
```

## Language roadmap

- **Now:** TypeScript for protocol, crypto helpers, HTTP, MCP, SDK.
- **Later:** Extract protocol core (crypto, canonical encoding, verify) to **Rust** (preferred) or Go when the wire format is frozen.
- **On-chain:** optional registry/anchor in Solidity — not the product surface.

## Contributing

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, …
- Open PRs against **`development`** (not directly to `main`).
