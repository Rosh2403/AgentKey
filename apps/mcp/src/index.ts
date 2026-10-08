import {
  TOOLS,
  agentkeyIssueStub,
  agentkeyResolveStub,
  agentkeyVerify,
} from "./tools.js";

/**
 * MCP server entry (slice-0).
 * Lists tools and demonstrates typed verify fail-closed behavior.
 * Full MCP stdio/HTTP transport wiring is a follow-up.
 */
function main(): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        service: "agentkey-mcp",
        tools: TOOLS.map((t) => t.name),
        note: "slice-0 stub — use agentkey_verify for typed fail-closed answers",
        demoVerify: agentkeyVerify({ agentId: "", proof: "" }),
        demoIssue: agentkeyIssueStub({
          publicHandle: "example-bot",
          publicKey: "stub",
        }),
        demoResolve: agentkeyResolveStub({ idOrHandle: "example-bot" }),
      },
      null,
      2,
    ),
  );
}

main();
