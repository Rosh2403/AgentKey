import type {
  AgentId,
  ChallengePurpose,
  ChallengeResponse,
  IssueRequest,
  ResolveRequest,
  RevokeRequest,
  VerifyRequest,
  VerifyResult,
} from "@agentkey/protocol";
import { failClosed } from "@agentkey/protocol";
import {
  issueAgent,
  issueChallenge,
  resolveAgent,
  revokeAgentIdentity,
  verifyAgent,
} from "@agentkey/api/handlers";

/**
 * MCP tool surface — same capabilities as HTTP:
 * agentkey_challenge | agentkey_issue | agentkey_resolve | agentkey_verify | agentkey_revoke
 *
 * Privileged ops (revoke, private-subject resolve) require ownership `proof`
 * and/or issuer admin bearer (`adminToken` / env AGENTKEY_ISSUER_ADMIN_TOKEN).
 */

export type McpToolName =
  | "agentkey_challenge"
  | "agentkey_issue"
  | "agentkey_resolve"
  | "agentkey_verify"
  | "agentkey_revoke";

export interface McpToolDescriptor {
  name: McpToolName;
  description: string;
}

export const TOOLS: McpToolDescriptor[] = [
  {
    name: "agentkey_challenge",
    description:
      "Get a one-time challenge (5 min, single use) for an agent to sign; purpose: verify | revoke | resolve",
  },
  {
    name: "agentkey_issue",
    description: "Register/issue an Agent ID under the Agentkey root issuer",
  },
  {
    name: "agentkey_resolve",
    description:
      "Resolve a public handle or Agent ID (private subject only with ownership proof or issuer admin)",
  },
  {
    name: "agentkey_verify",
    description: "Verify agent proof; typed fail-closed result",
  },
  {
    name: "agentkey_revoke",
    description:
      "Revoke an Agent ID (requires ownership proof or issuer admin); subsequent verify → revoked",
  },
];

export function agentkeyChallenge(input: {
  purpose?: ChallengePurpose;
}): { ok: true; challenge: ChallengeResponse } | { ok: false; error: string } {
  try {
    return { ok: true, challenge: issueChallenge(input.purpose ?? "verify") };
  } catch (err) {
    const message = err instanceof Error ? err.message : "challenge failed";
    return { ok: false, error: message };
  }
}

export async function agentkeyIssue(
  input: Partial<IssueRequest>,
): Promise<{ ok: true; agent: AgentId } | { ok: false; error: string }> {
  try {
    if (!input.publicHandle?.trim() || !input.publicKey?.trim()) {
      return { ok: false, error: "publicHandle and publicKey are required" };
    }
    const agent = await issueAgent({
      publicHandle: input.publicHandle,
      publicKey: input.publicKey,
      ...(input.commitOnChain !== undefined
        ? { commitOnChain: input.commitOnChain }
        : {}),
    });
    return { ok: true, agent };
  } catch (err) {
    const message = err instanceof Error ? err.message : "issue failed";
    return { ok: false, error: message };
  }
}

export function agentkeyResolve(
  input: Partial<ResolveRequest> & { adminToken?: string },
): { ok: true; agent: AgentId } | { ok: false; error: string; reason?: string } {
  if (!input.idOrHandle?.trim()) {
    return { ok: false, error: "idOrHandle is required" };
  }
  const result = resolveAgent(
    {
      idOrHandle: input.idOrHandle,
      ...(input.includePrivateSubject !== undefined
        ? { includePrivateSubject: input.includePrivateSubject }
        : {}),
      ...(input.proof !== undefined ? { proof: input.proof } : {}),
    },
    {
      ...(input.adminToken !== undefined
        ? { bearerToken: input.adminToken }
        : {}),
      ...(input.proof !== undefined ? { proof: input.proof } : {}),
    },
  );
  if ("error" in result) {
    return {
      ok: false,
      error: result.error,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
    };
  }
  return { ok: true, agent: result };
}

export function agentkeyVerify(input: Partial<VerifyRequest>): VerifyResult {
  try {
    if (!input.agentId?.trim() || !input.proof?.trim()) {
      return failClosed("agentId and proof are required");
    }
    return verifyAgent({
      agentId: input.agentId,
      proof: input.proof,
      ...(input.expectedChallenge !== undefined
        ? { expectedChallenge: input.expectedChallenge }
        : {}),
      ...(input.context !== undefined ? { context: input.context } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "verify failed";
    return failClosed(message);
  }
}

export async function agentkeyRevoke(
  input: Partial<RevokeRequest> & { adminToken?: string },
): Promise<
  { ok: true; agent: AgentId } | { ok: false; error: string; reason?: string }
> {
  if (!input.idOrHandle?.trim()) {
    return { ok: false, error: "idOrHandle is required" };
  }
  const result = await revokeAgentIdentity(
    {
      idOrHandle: input.idOrHandle,
      ...(input.proof !== undefined ? { proof: input.proof } : {}),
    },
    {
      ...(input.adminToken !== undefined
        ? { bearerToken: input.adminToken }
        : {}),
      ...(input.proof !== undefined ? { proof: input.proof } : {}),
    },
  );
  if ("error" in result) {
    return {
      ok: false,
      error: result.error,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
    };
  }
  return { ok: true, agent: result };
}

export async function invokeTool(
  name: McpToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "agentkey_challenge":
      return agentkeyChallenge(args as { purpose?: ChallengePurpose });
    case "agentkey_issue":
      return agentkeyIssue(args as Partial<IssueRequest>);
    case "agentkey_resolve":
      return agentkeyResolve(
        args as Partial<ResolveRequest> & { adminToken?: string },
      );
    case "agentkey_verify":
      return agentkeyVerify(args as Partial<VerifyRequest>);
    case "agentkey_revoke":
      return agentkeyRevoke(
        args as Partial<RevokeRequest> & { adminToken?: string },
      );
    default: {
      const _exhaustive: never = name;
      return { ok: false, error: `unknown tool: ${_exhaustive}` };
    }
  }
}
