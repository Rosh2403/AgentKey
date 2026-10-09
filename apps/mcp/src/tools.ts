import type {
  AgentId,
  IssueRequest,
  ResolveRequest,
  VerifyRequest,
  VerifyResult,
} from "@agentkey/protocol";
import { failClosed } from "@agentkey/protocol";
import {
  issueAgent,
  resolveAgent,
  revokeAgentIdentity,
  verifyAgent,
} from "@agentkey/api/handlers";

/**
 * MCP tool surface — same capabilities as HTTP:
 * agentkey_issue | agentkey_resolve | agentkey_verify | agentkey_revoke
 */

export type McpToolName =
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
    name: "agentkey_issue",
    description: "Register/issue an Agent ID under the Agentkey root issuer",
  },
  {
    name: "agentkey_resolve",
    description:
      "Resolve a public handle or Agent ID (dual: private subject only when authorized)",
  },
  {
    name: "agentkey_verify",
    description: "Verify agent proof; typed fail-closed result",
  },
  {
    name: "agentkey_revoke",
    description:
      "Revoke an Agent ID; subsequent verify returns status revoked (fail closed otherwise)",
  },
];

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
  input: Partial<ResolveRequest>,
): { ok: true; agent: AgentId } | { ok: false; error: string } {
  if (!input.idOrHandle?.trim()) {
    return { ok: false, error: "idOrHandle is required" };
  }
  const result = resolveAgent({
    idOrHandle: input.idOrHandle,
    ...(input.includePrivateSubject !== undefined
      ? { includePrivateSubject: input.includePrivateSubject }
      : {}),
  });
  if ("error" in result) {
    return { ok: false, error: result.error };
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
      ...(input.context !== undefined ? { context: input.context } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "verify failed";
    return failClosed(message);
  }
}

export async function agentkeyRevoke(
  input: Partial<{ idOrHandle: string }>,
): Promise<{ ok: true; agent: AgentId } | { ok: false; error: string }> {
  if (!input.idOrHandle?.trim()) {
    return { ok: false, error: "idOrHandle is required" };
  }
  const result = await revokeAgentIdentity(input.idOrHandle);
  if ("error" in result) {
    return { ok: false, error: result.error };
  }
  return { ok: true, agent: result };
}

export async function invokeTool(
  name: McpToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "agentkey_issue":
      return agentkeyIssue(args as Partial<IssueRequest>);
    case "agentkey_resolve":
      return agentkeyResolve(args as Partial<ResolveRequest>);
    case "agentkey_verify":
      return agentkeyVerify(args as Partial<VerifyRequest>);
    case "agentkey_revoke":
      return agentkeyRevoke(args as Partial<{ idOrHandle: string }>);
    default: {
      const _exhaustive: never = name;
      return { ok: false, error: `unknown tool: ${_exhaustive}` };
    }
  }
}
