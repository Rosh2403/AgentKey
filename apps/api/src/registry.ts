/**
 * Hybrid anchoring (locked C): optional on-chain commit interface.
 * Slice-0: local stub only — no production chain deploy.
 */

export interface AnchorRequest {
  agentId: string;
  publicKey: string;
}

export interface AnchorResult {
  commitment: string;
  /** Always false in slice-0 stub. */
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
  // Future: call Solidity registry via RPC when configured.
  return { commitment, onChain: false };
}
