import { randomUUID } from "node:crypto";
import {
  ROOT_ISSUER_ID,
  failClosed,
  parseOwnershipProof,
  type AgentId,
  type IssueRequest,
  type ResolveRequest,
  type RevokeRequest,
  type VerifyRequest,
  type VerifyResult,
} from "@agentkey/protocol";
import {
  createIssuerAttestation,
  isValidPublicKeyHex,
  verifyProof,
} from "@agentkey/crypto";
import {
  authorizeAgentControl,
  type AuthzCredentials,
  type AuthzErrorCode,
} from "./authz.js";
import {
  checkChallenge,
  consumeChallenge,
  isServerChallenge,
} from "./challenges.js";
import { getAgent, putAgent, revokeAgent, type StoredAgent } from "./store.js";
import { commitAnchor, revokeAnchor } from "./registry.js";
import { getIssuerKeys } from "./issuer.js";

export { issueChallenge, resetChallenges } from "./challenges.js";

export type HandlerError = {
  error: AuthzErrorCode | "not_found";
  reason?: string;
};

function toPublicAgent(agent: StoredAgent): AgentId {
  const { privateSubject: _hidden, ...publicView } = agent;
  return publicView;
}

export async function issueAgent(request: IssueRequest): Promise<AgentId> {
  if (!request.publicHandle?.trim() || !request.publicKey?.trim()) {
    throw new Error("publicHandle and publicKey are required");
  }
  if (!isValidPublicKeyHex(request.publicKey)) {
    throw new Error("publicKey must be a 32-byte Ed25519 key (hex)");
  }
  const existing = getAgent(request.publicHandle);
  if (existing) {
    throw new Error("publicHandle already registered");
  }

  const id = `ak_${randomUUID().replace(/-/g, "")}`;
  const privateSubject = `subj_${randomUUID().replace(/-/g, "")}`;
  const issuer = getIssuerKeys();

  let anchorCommitment: string | undefined;
  if (request.commitOnChain) {
    const anchor = await commitAnchor({
      agentId: id,
      publicKey: request.publicKey,
    });
    anchorCommitment = anchor.commitment;
  }

  const issuerAttestation = createIssuerAttestation({
    id,
    publicHandle: request.publicHandle,
    privateSubject,
    publicKey: request.publicKey,
    issuerPrivateKey: issuer.privateKey,
  });

  const agent: StoredAgent = {
    id,
    publicHandle: request.publicHandle,
    privateSubject,
    publicKey: request.publicKey,
    issuerId: ROOT_ISSUER_ID,
    issuerAttestation,
    status: "active",
    ...(anchorCommitment !== undefined ? { anchorCommitment } : {}),
    createdAt: new Date().toISOString(),
  };
  putAgent(agent);
  // Issue response includes private subject (registrant is authorized).
  return agent;
}

export function resolveAgent(
  request: ResolveRequest,
  credentials: AuthzCredentials = {},
): AgentId | HandlerError {
  const agent = getAgent(request.idOrHandle);
  if (!agent) {
    return { error: "not_found" };
  }
  if (!request.includePrivateSubject) {
    return toPublicAgent(agent);
  }

  const proof = request.proof ?? credentials.proof;
  const creds: AuthzCredentials = {
    purpose: "resolve",
    ...(credentials.bearerToken !== undefined
      ? { bearerToken: credentials.bearerToken }
      : {}),
    ...(proof !== undefined ? { proof } : {}),
  };
  const decision = authorizeAgentControl(agent, creds);
  if (!decision.ok) {
    return {
      error: decision.error,
      reason: decision.reason,
    };
  }
  return agent;
}

export function verifyAgent(request: VerifyRequest): VerifyResult {
  try {
    if (!request.agentId?.trim() || !request.proof?.trim()) {
      return failClosed("agentId and proof are required");
    }
    const agent = getAgent(request.agentId);
    if (!agent) {
      return verifyProof(request, undefined, {
        issuerPublicKey: getIssuerKeys().publicKey,
      });
    }
    const result = verifySignedProof(request, agent);
    if (result.status !== "valid") {
      return result;
    }
    return checkFreshness(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "verify failed";
    return failClosed(message);
  }
}

/**
 * Replay protection, applied once the signature checks out.
 * - `expectedChallenge` set: the proof must sign exactly that value.
 * - challenge from `POST /v1/challenges`: must be unexpired, unused and issued
 *   for verify; it is used up here so the same proof never passes twice.
 * - anything else is a self-chosen challenge nobody vouches for: rejected.
 */
function checkFreshness(request: VerifyRequest): VerifyResult {
  const parsed = parseOwnershipProof(request.proof);
  if ("error" in parsed) {
    return failClosed(parsed.error);
  }
  const { challenge } = parsed;
  if (
    request.expectedChallenge !== undefined &&
    challenge !== request.expectedChallenge
  ) {
    return { status: "invalid", reason: "challenge mismatch" };
  }
  if (isServerChallenge(challenge)) {
    const fresh = checkChallenge(challenge, "verify");
    if (!fresh.ok) {
      return { status: "invalid", reason: fresh.reason };
    }
    consumeChallenge(challenge);
    return { status: "valid" };
  }
  if (request.expectedChallenge === undefined) {
    return {
      status: "invalid",
      reason:
        "challenge not vouched for: sign a one-time challenge from POST /v1/challenges, or pass expectedChallenge",
    };
  }
  return { status: "valid" };
}

function verifySignedProof(
  request: VerifyRequest,
  agent: StoredAgent,
): VerifyResult {
  try {
    return verifyProof(
      request,
      {
        publicKey: agent.publicKey,
        status: agent.status,
        publicHandle: agent.publicHandle,
        privateSubject: agent.privateSubject,
        ...(agent.issuerAttestation !== undefined
          ? { issuerAttestation: agent.issuerAttestation }
          : {}),
      },
      { issuerPublicKey: getIssuerKeys().publicKey },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "verify failed";
    return failClosed(message);
  }
}

export async function revokeAgentIdentity(
  request: RevokeRequest,
  credentials: AuthzCredentials = {},
): Promise<AgentId | HandlerError> {
  if (!request.idOrHandle?.trim()) {
    return { error: "not_found", reason: "idOrHandle is required" };
  }

  const hasCreds = Boolean(
    credentials.proof?.trim() ||
      request.proof?.trim() ||
      credentials.bearerToken?.trim(),
  );
  if (!hasCreds) {
    return {
      error: "unauthorized",
      reason:
        "ownership proof or issuer admin token required (admin token off by default)",
    };
  }

  const existing = getAgent(request.idOrHandle);
  if (!existing) {
    return { error: "not_found", reason: "agent not found" };
  }

  const proof = request.proof ?? credentials.proof;
  const creds: AuthzCredentials = {
    purpose: "revoke",
    ...(credentials.bearerToken !== undefined
      ? { bearerToken: credentials.bearerToken }
      : {}),
    ...(proof !== undefined ? { proof } : {}),
  };
  const decision = authorizeAgentControl(existing, creds);
  if (!decision.ok) {
    return {
      error: decision.error,
      reason: decision.reason,
    };
  }

  // If this ID was anchored on-chain, revoke the chain record first when configured.
  if (existing.anchorCommitment) {
    await revokeAnchor(existing.id);
  }
  const revoked = revokeAgent(request.idOrHandle);
  if (!revoked) {
    return { error: "not_found", reason: "agent not found" };
  }
  return toPublicAgent(revoked);
}
