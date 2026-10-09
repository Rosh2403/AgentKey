#!/usr/bin/env bash
# Deploy Agentkey + ERC-8004 dual-write stack to a local Anvil node.
# Prerequisites: `anvil` running on http://127.0.0.1:8545
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RPC_URL="${AGENTKEY_REGISTRY_RPC_URL:-http://127.0.0.1:8545}"
# Anvil account #0 (dev only — never use on a real network)
PRIVATE_KEY="${AGENTKEY_REGISTRY_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
# Default: deploy ERC-8004 Identity + Adapter (set false for AgentkeyRegistry-only)
export AGENTKEY_DEPLOY_ERC8004="${AGENTKEY_DEPLOY_ERC8004:-true}"

echo "Deploying to ${RPC_URL} (ERC-8004=${AGENTKEY_DEPLOY_ERC8004}) ..."
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "${RPC_URL}" \
  --broadcast \
  --private-key "${PRIVATE_KEY}"

echo
echo "For dual-write (default):"
echo "  AGENTKEY_ANCHOR_ENABLED=true"
echo "  AGENTKEY_REGISTRY_RPC_URL=${RPC_URL}"
echo "  AGENTKEY_REGISTRY_ADDRESS=<AgentkeyErc8004Adapter address from logs>"
echo "  AGENTKEY_REGISTRY_PRIVATE_KEY=${PRIVATE_KEY}"
echo "  AGENTKEY_ERC8004_ADDRESS=<IdentityRegistry8004 address>   # optional, for reads/docs"
echo
echo "Optional demo registration (same private key must be issuer):"
echo "  AGENTKEY_ADAPTER_ADDRESS=<adapter> forge script script/DemoRegister.s.sol:DemoRegister \\"
echo "    --rpc-url ${RPC_URL} --broadcast --private-key ${PRIVATE_KEY}"
echo
echo "Off-chain verify still works with AGENTKEY_ANCHOR_ENABLED=false (no RPC required)."
