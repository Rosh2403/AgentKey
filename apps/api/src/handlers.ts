import { randomUUID } from "node:crypto";
import {
  ROOT_ISSUER_ID,
  failClosed,
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
import { getAgent, putAgent, revokeAgent, type StoredAgent } from "./store.js";
import { commitAnchor, revokeAnchor } from "./registry.js";
import { getIssuerKeys } from "./issuer.js";

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
