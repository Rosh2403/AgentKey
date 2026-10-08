/**
 * Agentkey protocol types (slice-0 stubs).
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
 * Slice-0: opaque string; binding/authz comes later.
 */
export type PrivateSubject = string;

export interface AgentId {
  /** Globally unique agent identifier (stable). */
  id: string;
  publicHandle: PublicHandle;
  /** Present only when authorized to see private subject. */
  privateSubject?: PrivateSubject;
  /** Subject public key material (hex or multibase — wire format TBD). */
  publicKey: string;
  /** Issuer attestation metadata (single root issuer). */
  issuerId: string;
  /** Optional hybrid on-chain commitment reference. */
  anchorCommitment?: string;
  createdAt: string;
}

export interface IssueRequest {
  publicHandle: PublicHandle;
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

export interface VerifyRequest {
  agentId: string;
  /** Challenge response / signature proof (format TBD). */
  proof: string;
  context?: Record<string, unknown>;
}

/** Fail-closed helper: any unexpected condition becomes `error`. */
export function failClosed(reason: string): VerifyResult {
  return { status: "error", reason };
}

export const ROOT_ISSUER_ID = "agentkey:root";
