# Agentkey

**Agentkey** is portable, verifiable **agent identity** — a unique key apps can **issue**, **resolve**, and **verify**, not another app-local account.

Product name: **Agentkey** (also written AgentKey in prose).

Verify always returns a typed answer: `valid` | `invalid` | `unknown` | `revoked` | `error`. On parse, crypto, or transport failure it **fails closed** (`error` / deny — never soft-allow).

## Identity model (locked A / C / C)

| Concept | Locked choice |
| --- | --- |
| **Issuer** | **A — Single root issuer** (Agentkey-operated root attests all IDs) |
| **Anchoring** | **C — Hybrid** (off-chain issue/resolve/verify by default; optional on-chain commit for public auditability) |
| **Subject / visibility** | **C — Dual** (public handle + private subject; correlate only with authorization) |

| Concept | Meaning |
| --- | --- |
| **Agent ID** | Globally unique ID bound to a public key (or key set) and optional metadata |
| **Subject** | Agent (or controller) that holds private material and can prove control |
| **Verifier** | Relying party asking “is this agent X?” and expecting a typed answer |

## Issue / resolve / verify

| Capability | HTTP | MCP tools |
| --- | --- | --- |
| **Issue** | `POST /v1/agents` | `agentkey_issue` |
| **Resolve** | `GET /v1/agents/{id}` | `agentkey_resolve` |
| **Verify** | `POST /v1/verify` → typed result | `agentkey_verify` → same typed enum |

Verify input: Agent ID + ownership proof (signature / challenge response) + optional context. Output is structured and machine-checkable — never free-text “maybe.”

HTTP and MCP share the same handlers and typed verify answers.

### Countersign-ready (surface only)

The TypeScript **HTTP + MCP** surface (`issue` / `resolve` / `verify`) is shaped for later product integration (e.g. Countersign). No Countersign wiring ships in this repo yet — only a stable TS product surface suitable to wrap later.

## Package map

```
apps/
  api/                 # HTTP: issue, resolve, verify
  mcp/                 # MCP tools: agentkey_issue | _resolve | _verify
packages/
  protocol/            # Agent ID types, canonical messages, verify result enum
  sdk/                 # Builder-facing client + key/proof helpers
  crypto/              # Ed25519 sign/verify + fail-closed verifyProof
tooling/               # shared tsconfig
examples/              # register → verify runnable script
```

**Language now:** TypeScript end-to-end (protocol, crypto helpers, HTTP, MCP, SDK).  
**Later:** optional extract of protocol core (crypto, canonical encoding, verify) to **Rust** (preferred) or Go once the wire format is frozen. Product surface stays TypeScript.  
**On-chain:** Solidity (or chain-native) **registry/anchor only** — not the product surface. Hybrid path is a stub/hook today.

Parallel work (on-chain registry, Rust core, dashboard, hardening) may land in **separate PRs** into `development`.

## How to run

Requires **Node ≥ 20** and **pnpm**.

```bash
pnpm install
pnpm typecheck
pnpm test
```

Start the API:

```bash
pnpm --filter @agentkey/api dev
# http://127.0.0.1:8787
```

In another terminal, run the register → verify example:

```bash
pnpm example:register-verify
```

Optional MCP tool server (same three capabilities):

```bash
pnpm --filter @agentkey/mcp dev
```

Copy `.env.example` → `.env` locally. Set `AGENTKEY_ISSUER_PRIVATE_KEY` / `AGENTKEY_ISSUER_PUBLIC_KEY` to 32-byte hex Ed25519 keys, or leave blank for ephemeral local issuer keys (dev only). **Never commit secrets.**

## Minimal example

1. **Issue** — generate Ed25519 subject keys; `POST /v1/agents` with `publicHandle` + `publicKey` (optional `commitOnChain` for the hybrid anchor stub).
2. **Resolve** — `GET /v1/agents/{idOrHandle}` (private subject omitted unless authorized).
3. **Verify** — `POST /v1/verify` with `agentId` + JSON ownership `proof` → typed `VerifyResult`.

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

See [examples/register-and-verify.md](./examples/register-and-verify.md) for curl and MCP details.

## Security

- **Fail closed** on verify errors (malformed proof, unknown issuer, policy/clock skew, transport failure).
- **No secrets in git** — env / secret manager only; `.env.example` uses placeholders.
- Private keys are never logged or returned from resolve.
- Issuer keys: set via env, or ephemeral in-memory keys for local/dev only.

## Hybrid anchoring

Off-chain is the default path for issue / resolve / verify. Optional on-chain commit (`commitOnChain` / `AGENTKEY_ANCHOR_*`) is a **registry stub** for IDs that need public auditability — not required for product verify. Production chain deploy is out of scope for the current slices.

## Contributing

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, …
- Open PRs against **`development`** (not directly to `main`).
- See [CONTRIBUTING.md](./CONTRIBUTING.md).
