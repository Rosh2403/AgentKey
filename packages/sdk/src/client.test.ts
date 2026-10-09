import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AgentkeyClient, agentKeys } from "./index.js";

describe("AgentkeyClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

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

  it("revoke posts to /v1/agents/{id}/revoke", async () => {
    const calls: { url: string; method: string }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      return new Response(
        JSON.stringify({
          id: "ak_revoked",
          publicHandle: "bot",
          publicKey: "aa".repeat(32),
          issuerId: "agentkey:root",
          status: "revoked",
          createdAt: new Date().toISOString(),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const client = new AgentkeyClient({ baseUrl: "http://example.test" });
    const agent = await client.revoke("ak_revoked");
    assert.equal(agent.status, "revoked");
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/v1\/agents\/ak_revoked\/revoke$/);
    assert.equal(calls[0]!.method, "POST");
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
