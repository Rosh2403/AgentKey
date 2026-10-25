import { timingSafeEqual } from "node:crypto";
import {
  canonicalVerifyMessage,
  parseOwnershipProof,
  type ChallengePurpose,
} from "@agentkey/protocol";
import {
  checkChallenge,
  consumeChallenge,
  isServerChallenge,
} from "./challenges.js";
import { isValidPublicKeyHex, verifySignature } from "@agentkey/crypto";
import type { StoredAgent } from "./store.js";

/**
 * Issuer-admin capability for privileged revoke / private-subject resolve.
 * Off by default: unset or empty `AGENTKEY_ISSUER_ADMIN_TOKEN` disables this path
 * (public demos must not ship with a default token).
 */
export function resolveIssuerAdminToken(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env.AGENTKEY_ISSUER_ADMIN_TOKEN?.trim();
  return raw ? raw : undefined;
}

export type AuthzErrorCode = "unauthorized" | "forbidden";

export type AuthzDecision =
  | { ok: true; via: "ownership" | "issuer_admin" }
  | { ok: false; error: AuthzErrorCode; reason: string };

export interface AuthzCredentials {
  /** JSON ownership proof (challenge + subject signature over agent id). */
  proof?: string;
  /** Bearer token from Authorization header (issuer admin, when enabled). */
  bearerToken?: string;
  /** What the proof's one-time challenge must have been issued for. */
  purpose?: ChallengePurpose;
}

function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Prove subject control of an agent id (status-agnostic).
 * Used for revoke / private-subject authz — not the public verify enum path.
 * The proof must sign a fresh one-time challenge issued for `purpose`
 * (`POST /v1/challenges`); it is used up on success so it can't be replayed.
 */
export function proveSubjectControl(input: {
  agentId: string;
  publicKey: string;
  proof: string;
  purpose: ChallengePurpose;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.proof?.trim()) {
    return { ok: false, reason: "missing proof" };
  }
  const parsed = parseOwnershipProof(input.proof);
  if ("error" in parsed) {
    return { ok: false, reason: parsed.error };
  }
  if (!isServerChallenge(parsed.challenge)) {
    return {
      ok: false,
      reason: `proof must sign a one-time challenge from POST /v1/challenges (purpose: ${input.purpose})`,
    };
  }
  const fresh = checkChallenge(parsed.challenge, input.purpose);
  if (!fresh.ok) {
    return fresh;
  }
  if (!isValidPublicKeyHex(input.publicKey)) {
    return { ok: false, reason: "resolved agent has invalid public key" };
  }
  const message = canonicalVerifyMessage(input.agentId, parsed.challenge);
  if (!verifySignature(message, parsed.signature, input.publicKey)) {
    return { ok: false, reason: "signature verification failed" };
  }
  consumeChallenge(parsed.challenge);
  return { ok: true };
}

/**
 * Authorize privileged control of an agent (revoke or private-subject read).
 * Fail closed: missing credentials → unauthorized; bad proof → forbidden.
 * Issuer admin is only accepted when `AGENTKEY_ISSUER_ADMIN_TOKEN` is set.
 */
export function authorizeAgentControl(
  agent: StoredAgent,
  credentials: AuthzCredentials,
  env: NodeJS.ProcessEnv = process.env,
): AuthzDecision {
  const adminToken = resolveIssuerAdminToken(env);
  const bearer = credentials.bearerToken?.trim();
  if (bearer && adminToken) {
    if (safeEqualString(bearer, adminToken)) {
      return { ok: true, via: "issuer_admin" };
    }
    // Wrong bearer with admin enabled: do not fall through to a missing-proof 401
    // if they also supplied a valid ownership proof.
  } else if (bearer && !adminToken) {
    // Admin path disabled — ignore bearer; ownership proof may still authorize.
  }

  const proof = credentials.proof?.trim();
  if (proof) {
    const owned = proveSubjectControl({
      agentId: agent.id,
      publicKey: agent.publicKey,
      proof,
      purpose: credentials.purpose ?? "revoke",
    });
    if (owned.ok) {
      return { ok: true, via: "ownership" };
    }
    return {
      ok: false,
      error: "forbidden",
      reason: owned.reason,
    };
  }

  if (bearer && adminToken) {
    return {
      ok: false,
      error: "forbidden",
      reason: "invalid issuer admin token",
    };
  }

  return {
    ok: false,
    error: "unauthorized",
    reason:
      "ownership proof or issuer admin token required (admin token off by default)",
  };
}

/** Parse `Authorization: Bearer <token>` (case-insensitive scheme). */
export function parseBearerToken(
  authorizationHeader: string | undefined,
): string | undefined {
  if (!authorizationHeader?.trim()) return undefined;
  const match = /^Bearer\s+(\S+)/i.exec(authorizationHeader.trim());
  return match?.[1];
}
