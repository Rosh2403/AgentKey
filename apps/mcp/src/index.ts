import { generateKeyPair, createOwnershipProof } from "@agentkey/crypto";
import {
  TOOLS,
  agentkeyChallenge,
  agentkeyIssue,
  agentkeyResolve,
  agentkeyVerify,
  invokeTool,
} from "./tools.js";

/**
 * MCP server entry.
 * Exposes agentkey_issue / resolve / verify / revoke with the same
 * typed verify answers as HTTP. Full MCP stdio transport can wrap invokeTool.
 */
async function main(): Promise<void> {
  const keys = generateKeyPair();
  const issued = await agentkeyIssue({
    publicHandle: `mcp-demo-${Date.now()}`,
    publicKey: keys.publicKey,
  });

  let demoVerify = agentkeyVerify({ agentId: "", proof: "" });
  let demoResolve: unknown = { ok: false, error: "issue failed" };

  const challenge = agentkeyChallenge({ purpose: "verify" });
  if (issued.ok && challenge.ok) {
    const proof = createOwnershipProof({
      agentId: issued.agent.id,
      challenge: challenge.challenge.challenge,
      privateKey: keys.privateKey,
    });
    demoVerify = agentkeyVerify({ agentId: issued.agent.id, proof });
    demoResolve = agentkeyResolve({ idOrHandle: issued.agent.publicHandle });
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        service: "agentkey-mcp",
        tools: TOOLS.map((t) => t.name),
        invoke: "import { invokeTool } from this package for tool dispatch",
        demoIssue: issued.ok
          ? { ok: true, id: issued.agent.id, handle: issued.agent.publicHandle }
          : issued,
        demoResolve,
        demoVerify,
      },
      null,
      2,
    ),
  );

  // Keep invokeTool referenced for consumers / tree-shaking clarity.
  void invokeTool;
}

void main();
