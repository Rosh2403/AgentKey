/**
 * Public wire types for the HTTP SDK.
 * Keep in sync with `@agentkey/protocol` (same field names and verify enum).
 * Inlined so `@agentkey/sdk` installs from git without workspace packages:
 *   pnpm add "github:Rosh2403/AgentKey#main&path:packages/sdk"
 */

/** Typed verify answers — machine-checkable; never free-text. */
export type VerifyStatus =
  | "valid"
  | "invalid"
  | "unknown"
  | "revoked"
  | "error";

export interface VerifyResult {
  status: VerifyStatus;
  /** Human-readable reason for non-valid outcomes; empty when valid. */
  reason?: string;
}

export type PublicHandle = string;
export type PrivateSubject = string;
export type AgentStatus = "active" | "revoked";

export interface AgentId {
  id: string;
  publicHandle: PublicHandle;
  privateSubject?: PrivateSubject;
  /** Subject Ed25519 public key (32-byte hex). */
  publicKey: string;
  issuerId: string;
  issuerAttestation?: string;
  status: AgentStatus;
  anchorCommitment?: string;
  /** Present when Agentkey dual-wrote to an ERC-8004 Identity Registry. */
  erc8004AgentId?: string;
  createdAt: string;
}

export interface IssueRequest {
  publicHandle: PublicHandle;
  publicKey: string;
  commitOnChain?: boolean;
}

export interface ResolveRequest {
  idOrHandle: string;
  includePrivateSubject?: boolean;
}

export interface VerifyRequest {
  agentId: string;
  /** JSON-encoded OwnershipProof (challenge + signature). */
  proof: string;
  context?: Record<string, unknown>;
}

/** Fail-closed helper: any unexpected condition becomes `error`. */
export function failClosed(reason: string): VerifyResult {
  return { status: "error", reason };
}

export function canonicalVerifyMessage(
  agentId: string,
  challenge: string,
): string {
  return `agentkey-verify-v1\n${agentId}\n${challenge}`;
}

export function encodeOwnershipProof(proof: {
  challenge: string;
  signature: string;
}): string {
  return JSON.stringify({
    challenge: proof.challenge,
    signature: proof.signature,
  });
}
