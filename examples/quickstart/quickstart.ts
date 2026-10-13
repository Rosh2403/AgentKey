/**
 * 5-minute quickstart: issue → verify (off-chain, no RPC).
 *
 * Prerequisites:
 *   pnpm install && pnpm build
 *   pnpm --filter @agentkey/api dev   # leave running on :8787
 *
 * Run:
 *   pnpm example:quickstart
 *
 * Override API URL:
 *   AGENTKEY_API_URL=http://127.0.0.1:8787 pnpm example:quickstart
 */

import { AgentkeyClient, agentKeys } from "@agentkey/sdk";

const baseUrl = process.env.AGENTKEY_API_URL ?? "http://127.0.0.1:8787";

async function main(): Promise<void> {
  const client = new AgentkeyClient({ baseUrl });
  const subject = agentKeys.generate();
  const handle = `quickstart-${Date.now()}`;

  console.log("Agentkey quickstart (off-chain — no RPC required)\n");

  console.log("1) issue — register public handle + subject pubkey");
  const agent = await client.issue({
    publicHandle: handle,
    publicKey: subject.publicKey,
  });
  console.log("   ", {
    id: agent.id,
    publicHandle: agent.publicHandle,
    privateSubject: agent.privateSubject,
    issuerId: agent.issuerId,
    status: agent.status,
  });

  console.log("2) resolve — public view (private subject omitted)");
  const resolved = await client.resolve({ idOrHandle: handle });
  console.log("   ", {
    id: resolved.id,
    publicHandle: resolved.publicHandle,
    privateSubject: resolved.privateSubject ?? null,
  });

  const challenge = `quickstart-${Date.now()}`;
  const proof = agentKeys.createProof({
    agentId: agent.id,
    challenge,
    privateKey: subject.privateKey,
  });

  console.log("3) verify — ownership proof → typed status");
  const verdict = await client.verify({ agentId: agent.id, proof });
  console.log("   ", verdict);

  if (verdict.status !== "valid") {
    process.exitCode = 1;
    console.error(
      "\nExpected status \"valid\". Is the API running?\n  pnpm --filter @agentkey/api dev",
    );
    return;
  }

  console.log("4) fail-closed — malformed proof → error (never soft-allow)");
  const closed = await client.verify({
    agentId: agent.id,
    proof: "not-a-proof",
  });
  console.log("   ", closed);
  if (closed.status !== "error") {
    process.exitCode = 1;
    console.error("Expected status \"error\" for malformed proof.");
    return;
  }

  console.log("\nDone. Typed verify: valid | invalid | unknown | revoked | error");
}

main().catch((err: unknown) => {
  console.error(err);
  console.error(
    "\nIs the API up? Off-chain path needs only:\n  pnpm --filter @agentkey/api dev",
  );
  process.exitCode = 1;
});
