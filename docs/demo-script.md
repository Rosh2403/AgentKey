# Agentkey — 90-second demo script (hackathon M3)

**Audience:** judges / partners on a Monad trust / AI-native track  
**Lead with:** the **SDK + typed verify primitive** (not dashboard chrome)  
**Story:** issue → resolve → verify (optional hybrid on-chain commit)

Product name: **Agentkey**. One composition: portable agent identity others compose on.

---

## 0:00–0:10 — One-liner (brand first)

> **Agentkey** is portable, verifiable **agent identity** — apps **issue**, **resolve**, and **verify** a unique key. Not another app-local account.

Hold up the repo / SDK import — not a dashboard screenshot.

```ts
import { AgentkeyClient, agentKeys } from "@agentkey/sdk";
```

---

## 0:10–0:25 — Why it matters on Monad

- AI agents need **identity that travels** across apps with a machine-checkable answer.
- Verify always returns a typed enum: `valid` | `invalid` | `unknown` | `revoked` | `error` — **fails closed** (never soft-allows).
- Hybrid anchoring (locked C): **off-chain by default**; optional **on-chain registry commit** for public auditability (EVM / Monad-ready Solidity registry).

One sentence on track fit: primitive for trust + data ownership; dashboard is optional theater.

---

## 0:25–0:70 — Live: issue → resolve → verify (~45s)

**Terminal A** (API already running):

```bash
pnpm --filter @agentkey/api dev
# http://127.0.0.1:8787
```

**Terminal B** — speak while the script runs:

```bash
pnpm example:register-verify
```

Narrate the three beats as they print:

| Beat | What you say | What they see |
| --- | --- | --- |
| **Issue** | “Agent generates Ed25519 keys and registers a public handle under the root issuer.” | `issued: { id, publicHandle, privateSubject, issuerId, status }` |
| **Resolve** | “A third party resolves the **public** handle — private subject stays hidden.” | `privateSubject: null` |
| **Verify** | “Agent signs a challenge; verifier gets a typed **`valid`**.” | `verdict: { status: "valid", … }` |
| **Fail-closed** | “Malformed proof → **`error`**, not maybe.” | `verdict: { status: "error", … }` |

Optional 10s (if Anvil + registry env set):

```bash
AGENTKEY_DEMO_COMMIT_ONCHAIN=1 pnpm example:register-verify
```

Show `anchorCommitment` — verify still off-chain. Skip if timing is tight; say “optional auditability hook.”

---

## 0:70–0:90 — Close + call to action

> Same capabilities over **HTTP**, **MCP** (`agentkey_issue` / `_resolve` / `_verify`), and the **SDK**. Off-chain works with zero RPC. On-chain commit is opt-in hybrid anchor — path to Monad-native registry (e.g. ERC-8004) without rewriting the verify enum.

CTA: “Builders: `pnpm example:register-verify` in five minutes. Partners: wrap issue/resolve/verify.”

---

## Replay (reproducible)

Requires Node ≥ 20 and pnpm.

```bash
git clone https://github.com/Rosh2403/AgentKey.git
cd AgentKey
git checkout development   # or the demo PR branch
pnpm install
pnpm --filter @agentkey/protocol build && pnpm --filter @agentkey/crypto build && pnpm --filter @agentkey/sdk build
pnpm --filter @agentkey/api dev   # terminal 1
pnpm example:register-verify      # terminal 2
```

Optional hybrid on-chain (local Anvil — see `contracts/README.md`):

```bash
anvil                                    # terminal 0
cd contracts && ./script/deploy-local.sh
# set AGENTKEY_ANCHOR_* in .env, restart API
AGENTKEY_DEMO_COMMIT_ONCHAIN=1 pnpm example:register-verify
```
