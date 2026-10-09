import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AgentkeyClient, agentKeys } from "./index.js";

describe("AgentkeyClient", () => {
  it("fails closed on verify transport errors", async () => {
    const client = new AgentkeyClient({
      baseUrl: "http://127.0.0.1:1",
    });
    const result = await client.verify({
      agentId: "ak_demo",
      proof: JSON.stringify({ challenge: "c", signature: "ab".repeat(64) }),
    });
    assert.equal(result.status, "error");
    assert.ok(result.reason);
  });

  it("agentKeys generates Ed25519 material and proofs", () => {
    const keys = agentKeys.generate();
    assert.equal(keys.publicKey.length, 64);
    const proof = agentKeys.createProof({
      agentId: "ak_x",
      challenge: "c",
      privateKey: keys.privateKey,
    });
    const parsed = JSON.parse(proof) as { challenge: string; signature: string };
    assert.equal(parsed.challenge, "c");
    assert.equal(parsed.signature.length, 128);
  });
});
