# Agentkey on-chain registry (hybrid anchor)

Solidity **registry/anchor only** — not the product surface. Issue, resolve, and verify stay in TypeScript and work **fully off-chain** by default.

## What it stores

| Field | Meaning |
| --- | --- |
| `agentIdHash` | `keccak256(bytes(agentId))` |
| `commitment` | `keccak256(bytes(string.concat(agentId, ":", publicKeyHex)))` |
| `revoked` | Issuer-set revoke flag |

Single root issuer (constructor arg) is the only address that may `commit` / `revoke`. Events: `Committed`, `Revoked`.

## Prerequisites

[Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`).

```bash
cd contracts
forge build
forge test -vv
```

## Local Anvil deploy

Terminal 1 — start a local chain:

```bash
anvil
```

Terminal 2 — deploy (uses Anvil account #0 by default):

```bash
cd contracts
chmod +x script/deploy-local.sh
./script/deploy-local.sh
# or:
forge script script/Deploy.s.sol:Deploy \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Copy the printed address into the API env (repo root `.env`, never commit secrets):

```bash
AGENTKEY_ANCHOR_ENABLED=true
AGENTKEY_REGISTRY_RPC_URL=http://127.0.0.1:8545
AGENTKEY_REGISTRY_ADDRESS=0x...   # from deploy output
AGENTKEY_REGISTRY_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Then issue with `commitOnChain: true` via HTTP/SDK/MCP. The API submits `commit` and stores the `0x`-prefixed commitment on the agent record.

Optional: set `AGENTKEY_REGISTRY_ISSUER` before deploy if the issuer should differ from the broadcaster.

## Verify without a chain

**Verify does not read the chain.** Off-chain issue → resolve → verify (Ed25519 ownership proof + issuer attestation) is the default path. Leave `AGENTKEY_ANCHOR_ENABLED=false` (or unset) and omit `commitOnChain` — no RPC, no contract, no wallet required.

On-chain commit is an **optional auditability hook** for IDs that need a public commitment. Product correctness of verify remains fail-closed off-chain.

## Layout

```
contracts/
  src/AgentkeyRegistry.sol
  test/AgentkeyRegistry.t.sol
  script/Deploy.s.sol
  script/deploy-local.sh
```
