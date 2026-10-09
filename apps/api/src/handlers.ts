import { randomUUID } from "node:crypto";
import {
  ROOT_ISSUER_ID,
  failClosed,
  type AgentId,
  type IssueRequest,
  type ResolveRequest,
  type VerifyRequest,
  type VerifyResult,
} from "@agentkey/protocol";
import {
  createIssuerAttestation,
  isValidPublicKeyHex,
  verifyProof,
} from "@agentkey/crypto";
import { getAgent, putAgent, revokeAgent, type StoredAgent } from "./store.js";
import { commitAnchor } from "./registry.js";
import { getIssuerKeys } from "./issuer.js";

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
): AgentId | { error: string } {
  const agent = getAgent(request.idOrHandle);
  if (!agent) {
    return { error: "not_found" };
  }
  if (request.includePrivateSubject) {
    // Slice-1: no real authz yet — opt-in flag only. Production must authorize.
    return agent;
  }
  return toPublicAgent(agent);
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

export function revokeAgentIdentity(
  idOrHandle: string,
): AgentId | { error: string } {
  const revoked = revokeAgent(idOrHandle);
  if (!revoked) {
    return { error: "not_found" };
  }
  return toPublicAgent(revoked);
}
