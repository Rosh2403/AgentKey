# Protocol v1 conformance fixtures

Shared vectors for **TypeScript** (`packages/protocol`, `packages/crypto`) and **Rust** (`crates/agentkey-core`).

- **Wire version:** `agentkey-v1`
- **File:** [`conformance.json`](./conformance.json)
- **Regen from TS:** `node scripts/generate-conformance-fixtures.mjs` (after `pnpm --filter @agentkey/crypto build`)

Seeds (`0x01…`, `0x02…`, `0x03…`) are deterministic **test** material only — not production secrets.
