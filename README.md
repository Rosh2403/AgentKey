# Agentkey

**Agentkey** is portable, verifiable **agent identity** — a unique key apps can **issue**, **resolve**, and **verify**, not another app-local account.

Product name: **Agentkey** (also written AgentKey in prose).

Verify always returns a typed answer: `valid` | `invalid` | `unknown` | `revoked` | `error`. On parse, crypto, or transport failure it **fails closed** (`error` / deny — never soft-allow).

## 5-minute quickstart (off-chain)

**No RPC. No wallet. No Foundry.** Issue → verify works with the API alone.

```bash
git clone https://github.com/Rosh2403/AgentKey.git
cd AgentKey
pnpm install
pnpm --filter @agentkey/api dev          # terminal 1 — leave running (:8787)
pnpm example:quickstart                  # terminal 2 — issue → verify
```

That’s **5 commands** from a cold clone. You should see `status: "valid"`, then a fail-closed `status: "error"` for a malformed proof.

Full walkthrough (MCP, troubleshooting, optional on-chain appendix): **[examples/quickstart/README.md](./examples/quickstart/README.md)**.

| Env | Quickstart need |
| --- | --- |
| `AGENTKEY_ISSUER_*` | Optional — blank → ephemeral local issuer keys (dev only) |
| `AGENTKEY_ANCHOR_*` / `AGENTKEY_REGISTRY_*` | **Leave off** — not used on the default path |
| Node / pnpm | Node ≥ 20 + pnpm |

Copy `.env.example` → `.env` only if you want persistent issuer keys (`pnpm issuer:generate`). **Never commit secrets.**

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
| **Revoke** | revoke route | `agentkey_revoke` |

Verify input: Agent ID + ownership proof (signature / challenge response) + optional context. Output is structured and machine-checkable — never free-text “maybe.”

HTTP and MCP share the same handlers and typed verify answers.

### MCP walkthrough

```bash
pnpm --filter @agentkey/mcp dev
```

Runs a demo: `agentkey_issue` → `agentkey_verify` with the same typed enum as HTTP. Tool names and args: [examples/quickstart/README.md § MCP](./examples/quickstart/README.md#mcp-walkthrough-issue--verify).

### Troubleshooting: `error` vs `invalid` vs `revoked`

| Status | Meaning |
| --- | --- |
| **`valid`** | Proof checks out |
| **`invalid`** | Well-formed proof, wrong signature / binding |
| **`unknown`** | Agent id not in store |
| **`revoked`** | Id was revoked — do not treat as `invalid` |
| **`error`** | Fail-closed deny (malformed proof, parse/crypto/transport failure) |

**`error` ≠ `invalid` ≠ `revoked`.** Soft-allow on `error` is never correct. Details: [examples/quickstart/README.md § Troubleshooting](./examples/quickstart/README.md#troubleshooting-error-vs-invalid-vs-revoked).

### Countersign-ready (surface only)

The TypeScript **HTTP + MCP** surface (`issue` / `resolve` / `verify`) is shaped for later product integration (e.g. Countersign). No Countersign wiring ships in this repo yet — only a stable TS product surface suitable to wrap later.

## Package map

```
apps/
  api/                 # HTTP: issue, resolve, verify
  mcp/                 # MCP tools: agentkey_issue | _resolve | _verify | _revoke
packages/
  protocol/            # Agent ID types, canonical messages, verify result enum
  sdk/                 # Builder-facing client + key/proof helpers
  crypto/              # Ed25519 sign/verify + fail-closed verifyProof
contracts/             # Optional Solidity registry/anchor (Foundry) — not required for verify
tooling/               # shared tsconfig
examples/
  quickstart/          # ≤5-command off-chain issue → verify
  register-and-verify* # curl / longer notes
```

**Language now:** TypeScript end-to-end (protocol, crypto helpers, HTTP, MCP, SDK).  
**Later:** optional extract of protocol core to **Rust** (see `crates/agentkey-core`) or Go once the wire format is frozen. Product surface stays TypeScript.  
**On-chain:** Solidity **registry/anchor only** — not the product surface. Default path is off-chain.

## SDK snippet

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

Also: `pnpm example:register-verify` and [examples/register-and-verify.md](./examples/register-and-verify.md) for curl details.

## Security

- **Fail closed** on verify errors (malformed proof, unknown issuer, policy/clock skew, transport failure).
- **No secrets in git** — env / secret manager only; `.env.example` uses placeholders.
- Private keys are never logged or returned from resolve.
- Issuer keys: set via env, or ephemeral in-memory keys for local/dev only.

## Hybrid anchoring (optional)

Off-chain is the **default** for issue / resolve / verify. Leave `AGENTKEY_ANCHOR_ENABLED=false`.

Optional on-chain commit (`commitOnChain` / `AGENTKEY_ANCHOR_*`) is a **registry stub** for IDs that need public auditability — not required for product verify. See [`contracts/README.md`](./contracts/README.md). ERC-8004 alignment is a separate workstream; this repo’s custom registry is the current anchor.

## Dev checks

```bash
pnpm typecheck
pnpm test
```

Optional dashboard: `pnpm --filter @agentkey/dashboard dev`.

## Contributing

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, …
- Open PRs against **`development`** (not directly to `main`).
- See [CONTRIBUTING.md](./CONTRIBUTING.md).
