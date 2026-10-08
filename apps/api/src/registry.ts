/**
 * Hybrid anchoring (locked C): optional on-chain commit interface.
 * Slice-1: local stub / hook only — no production chain deploy.
 */

export interface AnchorRequest {
  agentId: string;
  publicKey: string;
}

export interface AnchorResult {
  commitment: string;
  /** Always false until a real registry RPC is wired. */
  onChain: boolean;
}

export async function commitAnchor(
  request: AnchorRequest,
): Promise<AnchorResult> {
  const enabled = process.env.AGENTKEY_ANCHOR_ENABLED === "true";
  const material = `${request.agentId}:${request.publicKey}`;
  const commitment = `stub:${Buffer.from(material).toString("base64url")}`;
  if (!enabled) {
    return { commitment, onChain: false };
  }
  // Hook for future Solidity registry via AGENTKEY_REGISTRY_RPC_URL / ADDRESS.
  return { commitment, onChain: false };
}
