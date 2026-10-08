# Agentkey

Portable, verifiable **agent identity** — unique Agent IDs that apps can **issue**, **resolve**, and **verify** with typed answers (`valid` | `invalid` | `unknown` | `revoked` | `error`). Verify **fails closed** on errors.

> Product name: **Agentkey** (also written AgentKey in prose).

## Locked design

| Decision | Choice |
| --- | --- |
| Issuer model | **A — Single root issuer** |
| Anchoring | **C — Hybrid** (off-chain default + optional on-chain commit stub) |
| ID visibility | **C — Dual** (public handle + private subject) |
| Language | **TypeScript** end-to-end now; Rust/Go protocol core later; Solidity registry only when needed |

## Monorepo layout

```
apps/
  api/                 # HTTP: POST /v1/agents, GET /v1/agents/{id}, POST /v1/verify
  mcp/                 # MCP tools: agentkey_issue | agentkey_resolve | agentkey_verify
packages/
  protocol/            # ID + verify types + canonical messages
  sdk/                 # Builder client + key/proof helpers
  crypto/              # Ed25519 sign/verify + fail-closed verifyProof
tooling/               # shared tsconfig
examples/              # register → verify runnable script
```

## Quick start

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @agentkey/api dev
```

In another terminal:

```bash
pnpm example:register-verify
```

Copy `.env.example` → `.env` locally. Set `AGENTKEY_ISSUER_PRIVATE_KEY` / `AGENTKEY_ISSUER_PUBLIC_KEY` to 32-byte hex Ed25519 keys, or leave blank for ephemeral local issuer keys. **Never commit secrets.**

## Minimal example path

1. **Agent registers** — generate Ed25519 subject keys; `POST /v1/agents` with `publicHandle` + `publicKey` (optional `commitOnChain` for hybrid anchor stub).
2. **Third party verifies** — `POST /v1/verify` with `agentId` + JSON ownership `proof` → typed `VerifyResult` (errors → `status: "error"`, never soft-allow).

See [examples/register-and-verify.md](./examples/register-and-verify.md).

SDK:

```ts
import { AgentkeyClient, agentKeys } from "@agentkey/sdk";

const client = new AgentkeyClient({ baseUrl: "http://127.0.0.1:8787" });
const subject = agentKeys.generate();
const agent = await client.issue({
  publicHandle: "my-bot",
  publicKey: subject.publicKey,
});
const proof = agentKeys.createProof({
  agentId: agent.id,
  challenge: "login-1",
  privateKey: subject.privateKey,
});
const result = await client.verify({ agentId: agent.id, proof });
// result.status is typed; transport/parse/crypto failures → error
```

## Language roadmap

- **Now:** TypeScript for protocol, crypto helpers, HTTP, MCP, SDK.
- **Later:** Extract protocol core (crypto, canonical encoding, verify) to **Rust** (preferred) or Go when the wire format is frozen.
- **On-chain:** optional registry/anchor stub in Solidity — not the product surface.

## Contributing

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, …
- Open PRs against **`development`** (not directly to `main`).
