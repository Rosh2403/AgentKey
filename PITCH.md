# Agentkey — Monad track pitch

**One-liner:** Portable, verifiable **agent identity** — issue, resolve, and verify with typed, fail-closed answers (`valid` | `invalid` | `unknown` | `revoked` | `error`) over HTTP, MCP, and SDK.

**Track:** trust / data ownership / AI-native primitives  
**Product:** protocol/infra others compose on — not a consumer app. The dashboard is a 60-second demo of the primitive.

---

## Problem

Agent runtimes and apps invent **local accounts** per product. There is no portable ID that another verifier can check with a machine-readable answer. Soft-allow on crypto or transport failure is unsafe for agents that act with real authority. Discoverability without default correlation is rare: public handles leak private subjects, or everything stays siloed.

## Why a protocol (not an app)

Agentkey is **issue → resolve → verify**:

| Surface | Role |
| --- | --- |
| HTTP + MCP + SDK | Same handlers; typed verify enum |
| Dual IDs | Public handle + private subject; correlate only with authorization |
| Hybrid anchoring | Off-chain by default; optional on-chain commit for auditability |
| Fail-closed | Parse / crypto / transport failure → `error` / deny — never soft-allow |

Builders integrate the SDK or MCP tools; platforms verify without adopting Agentkey’s UI. Moat today: typed verify semantics, dual-ID privacy model, MCP-native surface, durable store + revoke, parallel Rust verify core for conformance — not a dashboard.

## Why Monad

Monad’s building blocks match the missing **trust + privacy** layers around the primitive:

| Building block | Fit | Status |
| --- | --- | --- |
| **ERC-8004** (trustless agent registry) | Non-capture discovery / registration above our typed verify | **Planned** — custom `AgentkeyRegistry.sol` ships today; ERC-8004 adapter or dual-write is the next on-chain move (separate track work) |
| **Native P256 / WebAuthn** | Bind a human controller (passkey) to an Agent ID without replacing Ed25519 agent keys | **Deferred / experimental** — design path only; not in product verify |
| **BTX** (encrypted mempools) | Private-subject commits/revokes without leaking intent in a public mempool | **Deferred** — relevance story for dual IDs; no prototype claimed |

Off-chain issue/resolve/verify already works with **no RPC**. Monad strengthens optional public auditability and the non-capture path — it does not gate the core product.

## Honest bootstrap → non-capture path

**Today (locked):** single Agentkey-operated **root issuer** attests all IDs. That is the cleanest MVP trust story *and* the sharpest “platform capture” critique.

**Slice-0 framing:** single root is **bootstrap**, not the end state.

| Phase | Trust model | What stays Agentkey’s |
| --- | --- | --- |
| Now | Root attests; optional custom registry commit | Typed verify, dual IDs, fail-closed, MCP/SDK |
| Next | Map or dual-write hybrid anchor → **ERC-8004** so discovery is not Agentkey-only | Same verify enum above the registry |
| Later | Verifiers accept a **set of issuer keys** (Agentkey root = issuer #1); federated issuers without rewriting the verify contract | Protocol semantics + DX |

We do **not** claim multi-issuer or ERC-8004 registration is shipped. Capture remediation is a **documented path + registry alignment**, not a silent redesign before submit.

## Who adopts

| Actor | Job | Why they care |
| --- | --- | --- |
| **Agent frameworks / MCP hosts** | Issue IDs; call `agentkey_verify` | Portable identity in agent runtimes |
| **Platforms & apps** | Verify before granting tools / spend / data | Typed deny path; no soft-allow |
| **Builders on Monad** | Optional on-chain commit / ERC-8004 discovery | Public auditability without forcing every verify on-chain |
| **Human controllers** (later) | WebAuthn / P256 binding | Prove a person controls an agent without doxxing the private subject |

**Who pays (path):** platforms and agent hosts that need reliable verify (infra / API), not end-user consumer subscriptions in this pitch.

## Traction & path forward

**Shipped (facts):** TypeScript issue/resolve/verify (HTTP + MCP + SDK), Ed25519, durable store + revoke + CI, dashboard demo, custom Solidity registry (hybrid, not ERC-8004), Rust `agentkey-core` parallel verify, docs/examples.

**30 days**

- ERC-8004 touchpoint (adapter, dual-write, or compatible registry + tests) — owned by contracts lane
- Judge-ready demo: issue → optional registry → resolve → verify; off-chain path still works without RPC
- DX: ≤5-minute clone → issue → verify; MCP walkthrough
- Keep CI green; known-good SHA on `main`

**90 days**

- Optional WebAuthn → P256 controller-binding experiment (additive; Ed25519 remains agent keys)
- BTX write-up and optional private-commit prototype for sensitive anchors
- Federated-issuer sketch (verifier trusts an issuer set)
- ≥1 integration partner conversation or early LOI-style note (no fabricated logos)
- Path: verifiers accept multiple issuer keys without changing the verify enum

## Risks (owned)

| Risk | Mitigation |
| --- | --- |
| Judges misread Agentkey as a dashboard app | Pitch + README lead with primitive / SDK / MCP |
| Single-root looks like platform lock-in | Explicit bootstrap narrative + ERC-8004 / multi-issuer roadmap |
| Custom registry ≠ ERC-8004 today | Honest “planned”; contracts work in flight; verify works with anchor off |
| Scope creep into consumer UI | Dashboard stays demo chrome only |
| Invented Monad features | Table above: used / planned / deferred — nothing claimed beyond shipped code |

## Ask

Judge the **primitive**: typed, fail-closed agent identity with dual IDs and hybrid anchoring — and the honest Monad path from single-root bootstrap to non-capturable registry discovery via ERC-8004.
