/**
 * End-to-end: agent registers → third party verifies against the HTTP API.
 *
 * Usage:
 *   1. pnpm --filter @agentkey/api dev
 *   2. pnpm example:register-verify
 *
 * Or with a custom base URL:
 *   AGENTKEY_API_URL=http://127.0.0.1:8787 pnpm example:register-verify
 */

import { AgentkeyClient, agentKeys } from "@agentkey/sdk";

const baseUrl = process.env.AGENTKEY_API_URL ?? "http://127.0.0.1:8787";

async function main(): Promise<void> {
  const client = new AgentkeyClient({ baseUrl });

  // --- Agent side: generate subject keys and register ---
  const subject = agentKeys.generate();
  const handle = `demo-bot-${Date.now()}`;

  console.log("1) Agent registers with public handle + pubkey…");
  const agent = await client.issue({
    publicHandle: handle,
    publicKey: subject.publicKey,
  });
  console.log("   issued:", {
    id: agent.id,
    publicHandle: agent.publicHandle,
    privateSubject: agent.privateSubject,
    issuerId: agent.issuerId,
    status: agent.status,
  });

  // --- Third party: resolve public view (no private subject) ---
  console.log("2) Third party resolves public handle…");
  const resolved = await client.resolve({ idOrHandle: handle });
  console.log("   resolved:", {
    id: resolved.id,
    publicHandle: resolved.publicHandle,
    privateSubject: resolved.privateSubject ?? null,
    publicKey: `${resolved.publicKey.slice(0, 16)}…`,
  });

  // --- Agent proves control; third party verifies ---
  const challenge = `verify-${Date.now()}`;
  const proof = agentKeys.createProof({
    agentId: agent.id,
    challenge,
    privateKey: subject.privateKey,
  });

  console.log("3) Third party verifies ownership proof…");
  const verdict = await client.verify({ agentId: agent.id, proof });
  console.log("   verdict:", verdict);

  if (verdict.status !== "valid") {
    process.exitCode = 1;
    console.error("Expected status valid — check that the API is running.");
    return;
  }

  // Fail-closed demo: malformed proof → error
  console.log("4) Fail-closed: malformed proof…");
  const closed = await client.verify({
    agentId: agent.id,
    proof: "not-a-proof",
  });
  console.log("   verdict:", closed);
  if (closed.status !== "error") {
    process.exitCode = 1;
    console.error("Expected fail-closed error for malformed proof.");
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
