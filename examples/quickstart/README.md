# 5-minute quickstart (off-chain)

Cold clone → install → run API → **issue → verify** in **≤5 commands**.  
**No RPC, no wallet, no Foundry.** On-chain anchoring is optional (see appendix).

## Exact commands

```bash
git clone https://github.com/Rosh2403/AgentKey.git && cd AgentKey
pnpm install && pnpm build
pnpm --filter @agentkey/api dev          # terminal 1 — leave running (:8787)
pnpm example:quickstart                  # terminal 2 — issue → verify
```

Expect `status: "valid"` for a good proof, then `status: "error"` for a malformed proof (fail-closed).

| # | Command | What it does |
| --- | --- | --- |
| 1 | `git clone … && cd AgentKey` | Get the repo and enter it |
| 2 | `pnpm install && pnpm build` | Install deps + compile workspace packages (Node ≥ 20, pnpm) |
| 3 | `pnpm --filter @agentkey/api dev` | Start HTTP API on `http://127.0.0.1:8787` |
| 4 | `pnpm example:quickstart` | Issue an ID, resolve, verify ownership |

Secrets: none required. Leave issuer keys blank for ephemeral local keys (dev only). Copy `.env.example` → `.env` only if you want persistent issuer keys (`pnpm issuer:generate`). **Never commit secrets.**

## What just happened

1. **Issue** — Ed25519 subject keypair + `POST /v1/agents` under the single root issuer.
2. **Resolve** — public handle lookup; private subject omitted by default (dual ID model).
3. **Verify** — signed ownership proof → typed `VerifyResult` (`valid`).
4. **Fail-closed demo** — garbage proof → `error` (never soft-allow).

SDK equivalent (same path the script uses):

```ts
import { AgentkeyClient, agentKeys } from "@agentkey/sdk";

const client = new AgentkeyClient({ baseUrl: "http://127.0.0.1:8787" });
const subject = agentKeys.generate();
const agent = await client.issue({
  publicHandle: "my-bot",
  publicKey: subject.publicKey,
});
const { challenge } = await client.challenge("verify"); // one-time, 5 min
const proof = agentKeys.createProof({
  agentId: agent.id,
  challenge,
  privateKey: subject.privateKey,
});
const result = await client.verify({ agentId: agent.id, proof });
// result.status is typed; parse/crypto/transport failures → "error"
```

## MCP walkthrough (issue → verify)

HTTP and MCP share the same handlers and typed verify answers.

```bash
pnpm --filter @agentkey/mcp dev
```

That runs a small demo: generate subject keys → `agentkey_issue` → `agentkey_verify` → prints JSON with `demoIssue` / `demoVerify`.

| Tool | Role |
| --- | --- |
| `agentkey_challenge` | One-time challenge to sign (`verify` / `revoke` / `resolve`; 5 min, single use) |
| `agentkey_issue` | Register handle + subject pubkey |
| `agentkey_resolve` | Resolve by id or public handle |
| `agentkey_verify` | Ownership proof → typed status |
| `agentkey_revoke` | Revoke with ownership `proof` (or admin token); later verify → `revoked` |

Programmatic dispatch (`apps/mcp/src/tools.ts` — same handlers as HTTP):

```ts
import { generateKeyPair, createOwnershipProof } from "@agentkey/crypto";
import { invokeTool } from "../../apps/mcp/src/tools.ts"; // from repo root

const keys = generateKeyPair();
const issued = await invokeTool("agentkey_issue", {
  publicHandle: "mcp-bot",
  publicKey: keys.publicKey,
});
if (!issued.ok) throw new Error(issued.error);
const ch = await invokeTool("agentkey_challenge", { purpose: "verify" });
if (!ch.ok) throw new Error(ch.error);
const proof = createOwnershipProof({
  agentId: issued.agent.id,
  challenge: ch.challenge.challenge,
  privateKey: keys.privateKey,
});
const verdict = await invokeTool("agentkey_verify", {
  agentId: issued.agent.id,
  proof,
});
// verdict.status === "valid"
```

Wire an MCP host to those tool names with the same JSON args as HTTP (`publicHandle` / `publicKey`, then `agentId` / `proof`). Revoke and private-subject resolve also need `proof` (or `adminToken` when `AGENTKEY_ISSUER_ADMIN_TOKEN` is set). See [docs/threat-model.md](../../docs/threat-model.md).

## Troubleshooting: `error` vs `invalid` vs `revoked`

Verify always returns a typed status — never free-text “maybe.” Judges: read this table, not `architecture.md`.

| Status | Meaning | Typical cause |
| --- | --- | --- |
| **`valid`** | Proof checks out | Subject signed the challenge for this agent id |
| **`invalid`** | Proof well-formed but wrong | Wrong key, wrong challenge/agentId binding, bad signature, **replayed or expired challenge** |
| **`unknown`** | No such agent | Typo’d id / never issued / different store |
| **`revoked`** | Agent was revoked | `agentkey_revoke` / `POST` revoke path already ran |
| **`error`** | Fail-closed deny | Malformed proof JSON, missing fields, crypto/parse/transport failure, broken issuer attestation |

**Rule of thumb**

- **`error`** = “we could not safely evaluate” → **deny** (fail closed). Soft-allow is never correct.
- **`invalid`** = “we evaluated; the proof is wrong” → deny with a distinct machine-readable reason.
- **`revoked`** = “this id existed; it is no longer trusted” → deny; do not treat as `invalid`.

Quick checks:

```bash
# API down / wrong port → start it, then retry
curl -sS http://127.0.0.1:8787/health

# Malformed proof → error
curl -sS -X POST http://127.0.0.1:8787/v1/verify \
  -H 'content-type: application/json' \
  -d '{"agentId":"ak_x","proof":"not-json"}'
```

## Off-chain path (default — unmissable)

**Issue / resolve / verify work with zero chain config.**

- Leave `AGENTKEY_ANCHOR_ENABLED=false` (or unset) in `.env.example`.
- Do **not** set `AGENTKEY_REGISTRY_*` for the quickstart.
- Do **not** pass `commitOnChain: true`.
- Product verify does **not** read RPC.

Optional on-chain commit is an auditability hook only — see appendix.

## Appendix: optional on-chain (not required)

Hybrid anchoring lives under [`contracts/`](../../contracts/). Custom registry today; ERC-8004 alignment is a separate track item — **not** part of this quickstart.

1. Read [`contracts/README.md`](../../contracts/README.md) (Anvil deploy + env).
2. Set `AGENTKEY_ANCHOR_ENABLED=true` and registry RPC/address/key (placeholders only; never commit secrets).
3. Issue with `commitOnChain: true` via HTTP / SDK / MCP.

Verify still succeeds **off-chain** with anchoring disabled. Do not block demo time on Foundry.

## Related

- Longer curl notes: [`../register-and-verify.md`](../register-and-verify.md)
- Persistence / issuer key files: [`../../docs/persistence.md`](../../docs/persistence.md)
