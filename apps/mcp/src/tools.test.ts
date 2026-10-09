import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createOwnershipProof,
  generateKeyPair,
} from "@agentkey/crypto";
import { clearStoreForTests } from "@agentkey/api/store";
import {
  resetIssuerKeysForTests,
  setIssuerKeysForTests,
} from "@agentkey/api/issuer";
import {
  agentkeyIssue,
  agentkeyResolve,
  agentkeyVerify,
  invokeTool,
} from "./tools.js";

describe("mcp tools", () => {
  beforeEach(() => {
    clearStoreForTests();
    resetIssuerKeysForTests();
    setIssuerKeysForTests(generateKeyPair());
  });

  it("fails closed on missing verify inputs", () => {
    const result = agentkeyVerify({});
    assert.equal(result.status, "error");
  });

  it("issue → resolve → verify end-to-end", async () => {
    const keys = generateKeyPair();
    const issued = await agentkeyIssue({
      publicHandle: `mcp-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const resolved = agentkeyResolve({
      idOrHandle: issued.agent.publicHandle,
    });
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.agent.privateSubject, undefined);
    }

    const proof = createOwnershipProof({
      agentId: issued.agent.id,
      challenge: "mcp-challenge",
      privateKey: keys.privateKey,
    });
    const verdict = agentkeyVerify({
      agentId: issued.agent.id,
      proof,
    });
    assert.equal(verdict.status, "valid");
  });

  it("invokeTool dispatches verify fail-closed", async () => {
    const result = (await invokeTool("agentkey_verify", {})) as {
      status: string;
    };
    assert.equal(result.status, "error");
  });
});
