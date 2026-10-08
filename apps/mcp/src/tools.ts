import { failClosed, type VerifyResult } from "@agentkey/protocol";
import { verifyProof } from "@agentkey/crypto";

/**
 * MCP tool surface (slice-0 stubs).
 * Same three capabilities as HTTP: issue / resolve / verify.
 * Wire these into a real MCP SDK transport in a follow-up.
 */

export type McpToolName =
  | "agentkey_issue"
  | "agentkey_resolve"
  | "agentkey_verify";

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
    description: "Resolve a public handle or Agent ID (dual: private subject only when authorized)",
  },
  {
    name: "agentkey_verify",
    description: "Verify agent proof; typed fail-closed result",
  },
];

export function agentkeyVerify(input: {
  agentId?: string;
  proof?: string;
}): VerifyResult {
  try {
    if (!input.agentId?.trim() || !input.proof?.trim()) {
      return failClosed("agentId and proof are required");
    }
    return verifyProof({ agentId: input.agentId, proof: input.proof });
  } catch (err) {
    const message = err instanceof Error ? err.message : "verify failed";
    return failClosed(message);
  }
}

export function agentkeyIssueStub(input: {
  publicHandle?: string;
  publicKey?: string;
}): { ok: false; error: string } | { ok: true; message: string } {
  if (!input.publicHandle?.trim() || !input.publicKey?.trim()) {
    return { ok: false, error: "publicHandle and publicKey are required" };
  }
  return {
    ok: true,
    message:
      "stub: call HTTP POST /v1/agents (or wire MCP server to shared handlers)",
  };
}

export function agentkeyResolveStub(input: {
  idOrHandle?: string;
}): { ok: false; error: string } | { ok: true; message: string } {
  if (!input.idOrHandle?.trim()) {
    return { ok: false, error: "idOrHandle is required" };
  }
  return {
    ok: true,
    message: "stub: call HTTP GET /v1/agents/{id} for resolve",
  };
}
