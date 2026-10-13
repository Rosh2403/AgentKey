# Agentkey on-chain registry (hybrid anchor + ERC-8004)

Solidity **registry/anchor only** — not the product surface. Issue, resolve, and verify stay in TypeScript and work **fully off-chain** by default.

**ERC-8004 status:** [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) is **Draft**. This repo ships a **best-effort compatible Identity Registry** plus a **dual-write adapter** from Agentkey commit → ERC-8004 `register`. Reputation / Validation registries are out of scope for this touchpoint.

## Architecture

| Contract | Role |
| --- | --- |
| `AgentkeyRegistry` | Hybrid commitment: Agent ID ↔ pubkey hash + revoke (single root issuer) |
| `IdentityRegistry8004` | Draft ERC-8004 Identity Registry (ERC-721 + URIStorage + metadata + agentWallet) |
| `AgentkeyErc8004Adapter` | Dual-write: issuer `commit`/`revoke` → nested AgentkeyRegistry **and** ERC-8004 register |

Default local deploy creates Identity + Adapter (adapter owns nested `AgentkeyRegistry`). Point `AGENTKEY_REGISTRY_ADDRESS` at the **adapter** so API `commit` dual-writes. Set `AGENTKEY_DEPLOY_ERC8004=false` to deploy AgentkeyRegistry alone.

## Field mapping — Agentkey → ERC-8004

| Agentkey | ERC-8004 (Identity) | Notes |
| --- | --- | --- |
| `agentId` (string, e.g. `ak_…`) | N/A as token id | Off-chain primary ID. Hash stored in metadata `agentkeyAgentIdHash`. |
| `agentIdHash` = `keccak256(bytes(agentId))` | metadata `agentkeyAgentIdHash` | Adapter writes on dual-write. |
| `commitment` = `keccak256(agentId + ":" + publicKeyHex)` | metadata `agentkeyCommitment` | Pubkey binding commitment (not raw pubkey on-chain). |
| `publicKey` (Ed25519 hex) | N/A on-chain | Stays off-chain; commitment binds it. |
| `publicHandle` | registration file `name` / custom metadata | Optional metadata key `agentkeyPublicHandle` if passed to `commitAndRegister`. |
| `privateSubject` | **N/A — never on-chain** | Dual-ID privacy: private subject must not be anchored in plaintext. |
| `revoked` (AgentkeyRegistry) | **No native revoke** | Adapter `dualRevoked` + `DualRevoked` event; issuer MAY update `agentURI` / metadata. |
| Issuer (single root, locked A) | ERC-721 `ownerOf(agentId)` after dual-write | Adapter mints then transfers NFT to root issuer. |
| — | `agentId` (uint256 tokenId) | ERC-8004 global id within `{eip155:chainId:identityRegistry}`. |
| — | `agentURI` / `tokenURI` | Points at registration file (`ipfs://`, `https://`, or demo `agentkey:v1:…`). |
| — | `agentWallet` (reserved metadata) | Cleared on transfer per draft; issuer may re-bind via EIP-712 `setAgentWallet`. |
| Typed verify enum | **N/A** | Product verify stays off-chain above the registry. |

## Prerequisites

[Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`).

```bash
cd contracts
forge build
forge test -vv
```

## Local Anvil deploy (judges)

Terminal 1 — start a local chain:

```bash
anvil
```

Terminal 2 — deploy dual-write stack (uses Anvil account #0 by default):

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

Copy logged addresses into the API env (repo root `.env`, never commit secrets):

```bash
AGENTKEY_ANCHOR_ENABLED=true
AGENTKEY_REGISTRY_RPC_URL=http://127.0.0.1:8545
# Dual-write: use the AgentkeyErc8004Adapter address (not the nested registry).
AGENTKEY_REGISTRY_ADDRESS=0x...   # adapter from deploy output
AGENTKEY_REGISTRY_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# Optional: Identity registry for docs / explorers
AGENTKEY_ERC8004_ADDRESS=0x...
```

Then issue with `commitOnChain: true` via HTTP/SDK/MCP. The API submits `commit` on the adapter (Agentkey + ERC-8004).

Optional one-shot Foundry demo registration:

```bash
AGENTKEY_ADAPTER_ADDRESS=0x... forge script script/DemoRegister.s.sol:DemoRegister \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

AgentkeyRegistry-only (no ERC-8004):

```bash
AGENTKEY_DEPLOY_ERC8004=false ./script/deploy-local.sh
```

Optional: set `AGENTKEY_REGISTRY_ISSUER` before deploy if the issuer should differ from the broadcaster.

## Verify without a chain

**Verify does not read the chain.** Off-chain issue → resolve → verify (Ed25519 ownership proof + issuer attestation) is the default path. Leave `AGENTKEY_ANCHOR_ENABLED=false` (or unset) and omit `commitOnChain` — no RPC, no contract, no wallet required.

On-chain commit / ERC-8004 registration is an **optional auditability + discovery hook**. Product correctness of verify remains fail-closed off-chain.

## Layout

```
contracts/
  src/AgentkeyRegistry.sol
  src/IdentityRegistry8004.sol
  src/AgentkeyErc8004Adapter.sol
  src/interfaces/IERC8004IdentityRegistry.sol
  test/AgentkeyRegistry.t.sol
  test/IdentityRegistry8004.t.sol
  test/AgentkeyErc8004Adapter.t.sol
  script/Deploy.s.sol
  script/DemoRegister.s.sol
  script/deploy-local.sh
```
