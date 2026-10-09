/**
 * Hybrid anchoring (locked C): optional on-chain commit via AgentkeyRegistry.
 * Off-chain issue / resolve / verify remain the product source of truth.
 * On-chain path is opt-in when env is fully configured.
 */

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  stringToBytes,
  type Hex,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

export interface AnchorRequest {
  agentId: string;
  publicKey: string;
}

export interface AnchorResult {
  /** `0x`-prefixed keccak256 commitment (Agent ID ↔ pubkey). */
  commitment: string;
  onChain: boolean;
  /** Present when a registry tx was mined. */
  txHash?: string;
}

export interface RegistryConfig {
  enabled: boolean;
  rpcUrl: string;
  address: Hex;
  privateKey: Hex;
}

const REGISTRY_ABI = [
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentIdHash", type: "bytes32" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentIdHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "agentIdHash", type: "bytes32" }],
    outputs: [
      { name: "commitment", type: "bytes32" },
      { name: "revoked", type: "bool" },
      { name: "exists", type: "bool" },
    ],
  },
] as const;

/** Matches Solidity `keccak256(bytes(agentId))`. */
export function computeAgentIdHash(agentId: string): Hex {
  return keccak256(stringToBytes(agentId));
}

/** Matches Solidity `keccak256(bytes(string.concat(agentId, ":", publicKey)))`. */
export function computeCommitment(agentId: string, publicKey: string): Hex {
  return keccak256(stringToBytes(`${agentId}:${publicKey}`));
}

export function readRegistryConfig(
  env: NodeJS.ProcessEnv = process.env,
): RegistryConfig | { error: string } | null {
  const enabled = env.AGENTKEY_ANCHOR_ENABLED === "true";
  if (!enabled) {
    return null;
  }
  const rpcUrl = env.AGENTKEY_REGISTRY_RPC_URL?.trim() ?? "";
  const address = env.AGENTKEY_REGISTRY_ADDRESS?.trim() ?? "";
  const privateKey = env.AGENTKEY_REGISTRY_PRIVATE_KEY?.trim() ?? "";
  if (!rpcUrl || !address || !privateKey) {
    return {
      error:
        "on-chain commit requested but AGENTKEY_REGISTRY_RPC_URL, ADDRESS, and PRIVATE_KEY must be set",
    };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return { error: "AGENTKEY_REGISTRY_ADDRESS must be a 20-byte hex address" };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    return {
      error: "AGENTKEY_REGISTRY_PRIVATE_KEY must be a 32-byte hex private key",
    };
  }
  return {
    enabled: true,
    rpcUrl,
    address: address as Hex,
    privateKey: privateKey as Hex,
  };
}

function clients(config: RegistryConfig): {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  account: Account;
} {
  const account = privateKeyToAccount(config.privateKey);
  const transport = http(config.rpcUrl);
  // Chain id is taken from the node; `foundry` is the Anvil-friendly default metadata.
  const publicClient = createPublicClient({
    chain: foundry,
    transport,
  });
  const walletClient = createWalletClient({
    account,
    chain: foundry,
    transport,
  });
  return { publicClient, walletClient, account };
}

/**
 * Commit Agent ID ↔ pubkey on-chain when hybrid anchor env is configured.
 * Throws when commit was requested but config is missing/invalid or the tx fails.
 */
export async function commitAnchor(
  request: AnchorRequest,
): Promise<AnchorResult> {
  const config = readRegistryConfig();
  if (config === null) {
    throw new Error(
      "commitOnChain requires AGENTKEY_ANCHOR_ENABLED=true and registry env",
    );
  }
  if ("error" in config) {
    throw new Error(config.error);
  }

  const agentIdHash = computeAgentIdHash(request.agentId);
  const commitment = computeCommitment(request.agentId, request.publicKey);
  const { publicClient, walletClient, account } = clients(config);

  const data = encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "commit",
    args: [agentIdHash, commitment],
  });

  const hash = await walletClient.sendTransaction({
    account,
    to: config.address,
    data,
    chain: foundry,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`on-chain commit failed: tx ${hash}`);
  }

  return {
    commitment,
    onChain: true,
    txHash: hash,
  };
}

/**
 * Revoke an on-chain commitment. No-op when hybrid anchor env is not configured.
 * Throws if configured but the tx fails (fail closed for on-chain state).
 */
export async function revokeAnchor(agentId: string): Promise<void> {
  const config = readRegistryConfig();
  if (config === null) {
    return;
  }
  if ("error" in config) {
    throw new Error(config.error);
  }

  const agentIdHash = computeAgentIdHash(agentId);
  const { publicClient, walletClient, account } = clients(config);

  const data = encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "revoke",
    args: [agentIdHash],
  });

  const hash = await walletClient.sendTransaction({
    account,
    to: config.address,
    data,
    chain: foundry,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`on-chain revoke failed: tx ${hash}`);
  }
}
