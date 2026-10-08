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
import { verifyProof } from "@agentkey/crypto";
import { getAgent, putAgent } from "./store.js";
import { commitAnchor } from "./registry.js";

export async function issueAgent(request: IssueRequest): Promise<AgentId> {
  if (!request.publicHandle?.trim() || !request.publicKey?.trim()) {
    throw new Error("publicHandle and publicKey are required");
  }
  const existing = getAgent(request.publicHandle);
  if (existing) {
    throw new Error("publicHandle already registered");
  }

  const id = `ak_${randomUUID().replace(/-/g, "")}`;
  const privateSubject = `subj_${randomUUID().replace(/-/g, "")}`;

  let anchorCommitment: string | undefined;
  if (request.commitOnChain) {
    const anchor = await commitAnchor({
      agentId: id,
      publicKey: request.publicKey,
    });
    anchorCommitment = anchor.commitment;
  }

  const agent: AgentId = {
    id,
    publicHandle: request.publicHandle,
    privateSubject,
    publicKey: request.publicKey,
    issuerId: ROOT_ISSUER_ID,
    ...(anchorCommitment !== undefined ? { anchorCommitment } : {}),
    createdAt: new Date().toISOString(),
  };
  putAgent(agent);
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
    // Slice-0: no real authz — do not return private subject by default path.
    // Callers must pass includePrivateSubject; production will require authorization.
    return agent;
  }
  const { privateSubject: _hidden, ...publicView } = agent;
  return publicView;
}

export function verifyAgent(request: VerifyRequest): VerifyResult {
  try {
    if (!request.agentId?.trim() || !request.proof?.trim()) {
      return failClosed("agentId and proof are required");
    }
    const agent = getAgent(request.agentId);
    if (!agent) {
      return { status: "unknown", reason: "agent not found" };
    }
    return verifyProof(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "verify failed";
    return failClosed(message);
  }
}
