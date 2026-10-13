# Example: agent registers → third party verifies

> **Prefer the 5-minute path:** [quickstart/README.md](./quickstart/README.md) (`pnpm example:quickstart`).  
> This page adds curl details and the longer scripted example.

Slice-1 uses real **Ed25519** keys. Issue binds `id` + `publicHandle` + `privateSubject` ↔ subject pubkey under the single root issuer. Verify checks an ownership proof against the resolved key and fails closed on parse/crypto/transport errors.

**Off-chain by default** — no RPC, no `AGENTKEY_REGISTRY_*`, no `commitOnChain`.

## 1. Start the API

```bash
pnpm install && pnpm build
pnpm --filter @agentkey/api dev
# http://127.0.0.1:8787
```

Optional: copy `.env.example` → `.env` and set `AGENTKEY_ISSUER_*` (32-byte hex). If unset, the API generates ephemeral issuer keys for local/dev (not for production).

## 2. Run the scripted example

```bash
pnpm example:quickstart
# or the older alias:
pnpm example:register-verify
```

This generates a subject keypair, calls `POST /v1/agents`, resolves the public handle, builds a signed ownership proof, and prints a typed verify result (`valid`), then a fail-closed malformed-proof case (`error`).

Optional hybrid on-chain commit (API must have `AGENTKEY_ANCHOR_*` set — see `contracts/README.md`):

```bash
AGENTKEY_DEMO_COMMIT_ONCHAIN=1 pnpm example:register-verify
# issue response includes anchorCommitment when the registry tx succeeds
```

Spoken 90-second judge script: [`docs/demo-script.md`](../docs/demo-script.md).

## 3. Manual curl path

Generate keys (Node one-liner) or use the SDK helpers from the script above. Subject `publicKey` must be **64 hex chars** (raw 32-byte Ed25519).

```bash
# Issue
curl -sS -X POST http://127.0.0.1:8787/v1/agents \
  -H 'content-type: application/json' \
  -d '{"publicHandle":"demo-bot","publicKey":"<64-hex-pubkey>"}'
```

Response includes `id`, `publicHandle`, `privateSubject` (dual model), `issuerAttestation`, `issuerId: "agentkey:root"`.

```bash
# Resolve (privateSubject omitted unless ?includePrivateSubject=true)
curl -sS http://127.0.0.1:8787/v1/agents/demo-bot
```

Proof wire format (JSON string in `proof`):

```json
{ "challenge": "any-string", "signature": "<hex Ed25519 over canonical message>" }
```

Canonical message: `agentkey-verify-v1\n{agentId}\n{challenge}` (signed by the subject private key). Prefer `pnpm example:quickstart` or `agentKeys.createProof` from `@agentkey/sdk` over hand-rolling signatures.

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/verify \
  -H 'content-type: application/json' \
  -d '{"agentId":"<id>","proof":"<json ownership proof>"}'
```

Typed results: `valid` | `invalid` | `unknown` | `revoked` | `error`. Malformed proof → `{ "status": "error", … }` (HTTP 400). Never soft-allows.

See [quickstart troubleshooting](./quickstart/README.md#troubleshooting-error-vs-invalid-vs-revoked) for `error` vs `invalid` vs `revoked`.

## SDK path

```ts
import { AgentkeyClient, agentKeys } from "@agentkey/sdk";

const ak = new AgentkeyClient({ baseUrl: "http://127.0.0.1:8787" });
const subject = agentKeys.generate();
const agent = await ak.issue({
  publicHandle: "demo-bot",
  publicKey: subject.publicKey,
});
const proof = agentKeys.createProof({
  agentId: agent.id,
  challenge: "login-1",
  privateKey: subject.privateKey,
});
const verdict = await ak.verify({ agentId: agent.id, proof });
console.log(verdict.status); // "valid"
```

## MCP tools

Same capabilities: `agentkey_issue`, `agentkey_resolve`, `agentkey_verify`, `agentkey_revoke` (shared handlers with HTTP).

```bash
pnpm --filter @agentkey/mcp dev
```

Full MCP issue → verify walkthrough: [quickstart/README.md § MCP](./quickstart/README.md#mcp-walkthrough-issue--verify).

## Optional on-chain

Not required for verify. See [quickstart appendix](./quickstart/README.md#appendix-optional-on-chain-not-required) and [`contracts/README.md`](../contracts/README.md).
