/**
 * Agentkey protocol types (slice-1).
 *
 * Locked decisions:
 * - Issuer: single root (A)
 * - Anchoring: hybrid off-chain default + optional on-chain commit (C)
 * - ID visibility: dual — public handle + private subject (C)
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

/** Public handle — discoverable / brandable identifier. */
export type PublicHandle = string;

/**
 * Private subject — correlates only with authorization.
 * Dual model (locked C): never returned from public resolve by default.
 */
export type PrivateSubject = string;

/** Lifecycle status for an issued agent identity. */
export type AgentStatus = "active" | "revoked";

export interface AgentId {
  /** Globally unique agent identifier (stable). */
  id: string;
  publicHandle: PublicHandle;
  /** Present only when authorized to see private subject. */
  privateSubject?: PrivateSubject;
  /** Subject Ed25519 public key (32-byte hex). */
  publicKey: string;
  /** Issuer attestation metadata (single root issuer). */
  issuerId: string;
  /** Hex Ed25519 signature by root issuer over the ID↔pubkey binding. */
  issuerAttestation?: string;
  status: AgentStatus;
  /** Optional hybrid on-chain commitment reference. */
  anchorCommitment?: string;
  createdAt: string;
}

export interface IssueRequest {
  publicHandle: PublicHandle;
  /** Subject Ed25519 public key (32-byte hex). */
  publicKey: string;
  /** When true, request optional on-chain commit (hybrid path). */
  commitOnChain?: boolean;
}

export interface ResolveRequest {
  /** Resolve by id or public handle. */
  idOrHandle: string;
  /** If true and authorized, include privateSubject. */
  includePrivateSubject?: boolean;
}

/**
 * Ownership proof: subject signs a challenge bound to the agent id.
 * Wire format in VerifyRequest.proof is JSON of this shape.
 */
export interface OwnershipProof {
  challenge: string;
  /** Hex-encoded Ed25519 signature over canonicalVerifyMessage. */
  signature: string;
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

export const ROOT_ISSUER_ID = "agentkey:root";

/** Canonical message signed by the subject for ownership verify. */
export function canonicalVerifyMessage(
  agentId: string,
  challenge: string,
): string {
  return `agentkey-verify-v1\n${agentId}\n${challenge}`;
}

/** Canonical message signed by the root issuer at issue time. */
export function canonicalIssueMessage(input: {
  id: string;
  publicHandle: string;
  privateSubject: string;
  publicKey: string;
}): string {
  return [
    "agentkey-issue-v1",
    input.id,
    input.publicHandle,
    input.privateSubject,
    input.publicKey,
  ].join("\n");
}

export function encodeOwnershipProof(proof: OwnershipProof): string {
  return JSON.stringify({
    challenge: proof.challenge,
    signature: proof.signature,
  });
}

/**
 * Parse ownership proof from the wire string.
 * Returns `{ error }` on malformed input (callers must fail closed).
 */
export function parseOwnershipProof(
  proof: string,
): OwnershipProof | { error: string } {
  if (!proof?.trim()) {
    return { error: "missing proof" };
  }
  try {
    const parsed: unknown = JSON.parse(proof);
    if (!parsed || typeof parsed !== "object") {
      return { error: "proof must be a JSON object" };
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.challenge !== "string" || !obj.challenge.trim()) {
      return { error: "proof.challenge must be a non-empty string" };
    }
    if (typeof obj.signature !== "string" || !obj.signature.trim()) {
      return { error: "proof.signature must be a non-empty string" };
    }
    return { challenge: obj.challenge, signature: obj.signature };
  } catch {
    return { error: "proof is not valid JSON" };
  }
}
