# agentkey-core

Rust **protocol core** for Agentkey: Ed25519 verify, canonical encoding, and typed verify outcomes.

This is a **parallel** implementation of the TypeScript packages:

| TS package | Rust module |
| --- | --- |
| `@agentkey/protocol` | `canonical`, `proof`, `VerifyStatus` / `VerifyResult` |
| `@agentkey/crypto` (`verifyProof`, keys) | `verify`, `keys` |

## Wire version

- Tag: **`agentkey-v1`** (`WIRE_VERSION`)
- Canonical ownership message prefix: `agentkey-verify-v1`
- Canonical issue attestation prefix: `agentkey-issue-v1`

These must stay byte-identical to `packages/protocol`. Shared vectors live in [`fixtures/protocol-v1/`](../../fixtures/protocol-v1/).

## Product surface (important)

**HTTP / MCP / SDK still call TypeScript.** This crate is for never-forge / multi-language verify later. Do **not** treat Rust as the live product API until an intentional FFI or WASM bridge is designed and shipped.

## Build & test

Requires Rust **1.85+** (see [`rust-toolchain.toml`](../../rust-toolchain.toml) at the repo root).

```bash
# from repo root
cargo test -p agentkey-core

# optional thin CLI (reads verify JSON on stdin, prints VerifyResult)
cargo run -p agentkey-core --features cli --bin agentkey-verify < some-request.json
```

Conformance tests load `fixtures/protocol-v1/conformance.json` (generated from the TS crypto path via `node scripts/generate-conformance-fixtures.mjs`).

## Fail closed

Malformed proofs, bad crypto, and missing issuer config return `status: "error"` — never soft-allow. Typed outcomes otherwise: `valid` | `invalid` | `unknown` | `revoked` | `error`.

## Secrets

No private keys are embedded for production. Fixture seeds under `fixtures/protocol-v1/` are **test-only** deterministic vectors.
