#!/usr/bin/env bash
# Deploy AgentkeyRegistry to a local Anvil node.
# Prerequisites: `anvil` running on http://127.0.0.1:8545
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RPC_URL="${AGENTKEY_REGISTRY_RPC_URL:-http://127.0.0.1:8545}"
# Anvil account #0 (dev only — never use on a real network)
PRIVATE_KEY="${AGENTKEY_REGISTRY_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

echo "Deploying AgentkeyRegistry to ${RPC_URL} ..."
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "${RPC_URL}" \
  --broadcast \
  --private-key "${PRIVATE_KEY}"

echo
echo "Copy the logged address into AGENTKEY_REGISTRY_ADDRESS."
echo "Then set AGENTKEY_ANCHOR_ENABLED=true and the same RPC / private key in your API .env."
