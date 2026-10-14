# Agentkey threat model (prototype)

> **Prototype / not production security audited.**  
> This document describes trust boundaries and residual risks for the current
> Agentkey stack. It is **not** a claim of production-ready security, a
> penetration-test report, or a compliance attestation. Treat public demos as
> experimental; do not pitch “security” as a finished strength beyond the
> fail-closed verify semantics and the authz checks documented here.

## Trust boundaries

| Actor | Role | Trust assumption |
| --- | --- | --- |
| **Issuer** | Single root (`agentkey:root`) that attests ID ↔ pubkey bindings at issue time | Operators of the issuer process and its key material are trusted for issuance and optional admin revoke / private-subject read |
| **Subject** | Holder of the Ed25519 subject private key for an Agent ID | Anyone who controls the subject key can prove ownership (verify, revoke, private-subject resolve) |
| **Verifier** | Relying party calling verify | Receives a typed enum; must **deny** on `invalid` / `unknown` / `revoked` / `error` (fail closed — never soft-allow) |
| **Gateway** | HTTP API and MCP tool surface sharing the same handlers | Network-reachable process; must enforce authz on privileged routes; CORS is open for local/demo use |

Off-chain store and optional on-chain registry/anchor sit behind the issuer process. Verifiers do not need write access to the store.

## What is protected

- **Ownership verify** — Subject signs `agentkey-verify-v1\n{agentId}\n{challenge}`; server checks signature against the stored pubkey (and issuer attestation when present). Malformed proofs → `error` (HTTP 400). Fail closed.
- **Revoke** — Requires proof of control of the subject key (same ownership proof wire format) **or** an explicitly enabled issuer-admin bearer token. Unauthenticated revoke → **401**; bad proof → **403**; unknown agent (with credentials) → **404**.
- **Private subject** — Dual-ID model: public resolve never includes `privateSubject`. `includePrivateSubject=true` requires the same ownership proof or issuer admin; without it the request is **denied** (401/403) and private data is never returned. Issue response still returns `privateSubject` to the registrant.
- **Secrets hygiene** — Issuer and subject private keys are not returned from public resolve; `.env.example` is placeholders only; no secrets in git.

## What is not protected (by design / residual)

- **Issue** is not gated by end-user auth in this prototype (anyone who can reach the API can register a new handle with their own pubkey).
- **Public resolve** exposes `id`, `publicHandle`, `publicKey`, status, and attestation metadata — intentional for discovery/verify.
- **Challenge freshness / replay** — Ownership proofs are not bound to server-issued nonces or TTLs yet; a captured proof could be replayed until keys rotate or the id is revoked.
- **Transport security** — Local demos often use plain HTTP; production must terminate TLS and restrict network exposure.
- **CORS `*`** — Suitable for local dashboard demos; not a production browser hardening posture.
- **MCP process trust** — MCP tools call the same handlers in-process; tool callers with the subject private key (or admin token) inherit those privileges.

## Revoke & private-subject authorization model

Privileged operations share one fail-closed check:

1. **Ownership proof (preferred)** — JSON `{ challenge, signature }` over the canonical verify message for the **canonical agent id** (not merely the public handle), signed by the registered subject key.
2. **Issuer admin (optional, off by default)** — `Authorization: Bearer <token>` where the token equals `AGENTKEY_ISSUER_ADMIN_TOKEN`. If that env var is unset or blank, the admin path is **disabled** (correct for public demos). Wrong token → **403** when the admin path is enabled; bare bearer with admin disabled does not authorize.

| Operation | No credentials | Wrong key | Valid ownership / admin |
| --- | --- | --- | --- |
| `POST …/revoke` | 401 | 403 | 200 + `status: revoked` |
| `GET …?includePrivateSubject=true` | 401 | 403 | 200 + `privateSubject` |
| Public `GET` resolve | 200 (no private field) | n/a | n/a |

HTTP, MCP (`proof` / `adminToken`), and the SDK (`proof` / `accessToken`) require the same fields.

## Explicit prototype disclaimer

Agentkey today is a **hackathon / slice-1 prototype**: typed fail-closed verify, dual IDs, durable file store, optional registry anchor, and the authz gates above. It has **not** been independently security audited. Do not describe it as production-hardened identity infrastructure. Prefer accurate claims: portable issue/resolve/verify with machine-checkable outcomes and fail-closed errors.

## Residual risks

| Risk | Why it remains |
| --- | --- |
| **Single root issuer** | Compromised issuer keys can attest arbitrary bindings; multi-issuer / ERC-8004 discovery is future work |
| **File-backed agent store** | Local JSON durability (see [persistence.md](./persistence.md)); no multi-tenant isolation, encryption-at-rest, or HA |
| **Ephemeral issuer keys** | If `AGENTKEY_ISSUER_*` unset, keys are in-memory for the process — fine for demos, wrong for any durable trust |
| **Admin token in env** | Shared bearer is a blunt operator capability; rotate and keep off in public demos |
| **No rate limits / abuse controls** | Open issue endpoint can be spammed |
| **On-chain path optional** | Hybrid anchor does not replace off-chain authz; registry issuer key is a separate high-value secret |

## Related docs

- [README.md](../README.md) — product overview (links here; does not overclaim security)
- [persistence.md](./persistence.md) — store backend
- [examples/register-and-verify.md](../examples/register-and-verify.md) — curl / proof wire format
