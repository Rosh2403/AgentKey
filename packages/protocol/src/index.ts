/**
 * Agentkey protocol types (slice-1).
 *
 * Locked decisions:
 * - Issuer: single root (A)
 * - Anchoring: hybrid off-chain default + optional on-chain commit (C)
 * - ID visibility: dual — public handle + private subject (C)
 *
 * Wire tag shared with the Rust core (`crates/agentkey-core`, `WIRE_VERSION`)
 * and `fixtures/protocol-v1/`. Canonical *message* prefixes below are also
 * versioned (`agentkey-verify-v1`, `agentkey-issue-v1`).
 */

/** Overall wire / protocol version tag (Rust + fixtures use the same string). */
export const WIRE_VERSION = "agentkey-v1" as const;

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
  /**
   * If true, include privateSubject only when authorized
   * (ownership proof or issuer admin). Without authz → denied (fail closed).
   */
  includePrivateSubject?: boolean;
  /**
   * JSON ownership proof (same wire format as verify). Required when
   * `includePrivateSubject` is true unless issuer admin bearer is used.
   */
  proof?: string;
}

/** Privileged revoke — requires ownership proof and/or issuer admin. */
export interface RevokeRequest {
  /** Revoke by id or public handle. */
  idOrHandle: string;
  /** JSON ownership proof signed by the subject key for the canonical agent id. */
  proof?: string;
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
  /**
   * Challenge the verifier handed to the agent. When set, the proof must be
   * signed over exactly this value (stops a proof made for someone else from
   * being replayed to you). Leave unset only when the agent signed a fresh
   * one-time challenge from `POST /v1/challenges`.
   */
  expectedChallenge?: string;
  context?: Record<string, unknown>;
}

/**
 * What a one-time challenge may be used for. A challenge issued for `verify`
 * cannot authorize a `revoke`, so handing someone a login proof never lets
 * them revoke your agent.
 */
export type ChallengePurpose = "verify" | "revoke" | "resolve";

export const CHALLENGE_PURPOSES: readonly ChallengePurpose[] = [
  "verify",
  "revoke",
  "resolve",
];

/** Prefix for server-issued one-time challenges. */
export const CHALLENGE_PREFIX = "akc_";

export interface ChallengeRequest {
  purpose?: ChallengePurpose;
}

export interface ChallengeResponse {
  challenge: string;
  purpose: ChallengePurpose;
  /** ISO time after which the challenge is rejected. */
  expiresAt: string;
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
