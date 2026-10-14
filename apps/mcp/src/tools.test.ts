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
  agentkeyRevoke,
  agentkeyVerify,
  invokeTool,
} from "./tools.js";

describe("mcp tools", () => {
  beforeEach(() => {
    clearStoreForTests();
    resetIssuerKeysForTests();
    setIssuerKeysForTests(generateKeyPair());
    delete process.env.AGENTKEY_ISSUER_ADMIN_TOKEN;
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

  it("resolve private subject without proof is denied", async () => {
    const keys = generateKeyPair();
    const issued = await agentkeyIssue({
      publicHandle: `mcp-priv-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const denied = agentkeyResolve({
      idOrHandle: issued.agent.id,
      includePrivateSubject: true,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.error, "unauthorized");
    }
  });

  it("resolve private subject with ownership proof", async () => {
    const keys = generateKeyPair();
    const issued = await agentkeyIssue({
      publicHandle: `mcp-priv-ok-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const proof = createOwnershipProof({
      agentId: issued.agent.id,
      challenge: "private",
      privateKey: keys.privateKey,
    });
    const resolved = agentkeyResolve({
      idOrHandle: issued.agent.id,
      includePrivateSubject: true,
      proof,
    });
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.agent.privateSubject, issued.agent.privateSubject);
    }
  });

  it("revoke without proof is denied", async () => {
    const keys = generateKeyPair();
    const issued = await agentkeyIssue({
      publicHandle: `mcp-revoke-denied-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const denied = await agentkeyRevoke({ idOrHandle: issued.agent.id });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.error, "unauthorized");
    }
  });

  it("revoke end-to-end with ownership proof: verify returns revoked", async () => {
    const keys = generateKeyPair();
    const issued = await agentkeyIssue({
      publicHandle: `mcp-revoke-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const revokeProof = createOwnershipProof({
      agentId: issued.agent.id,
      challenge: "mcp-revoke",
      privateKey: keys.privateKey,
    });
    const revoked = await agentkeyRevoke({
      idOrHandle: issued.agent.id,
      proof: revokeProof,
    });
    assert.equal(revoked.ok, true);
    if (revoked.ok) {
      assert.equal(revoked.agent.status, "revoked");
    }

    const proof = createOwnershipProof({
      agentId: issued.agent.id,
      challenge: "after-revoke",
      privateKey: keys.privateKey,
    });
    const verdict = agentkeyVerify({
      agentId: issued.agent.id,
      proof,
    });
    assert.equal(verdict.status, "revoked");
  });

  it("invokeTool dispatches verify fail-closed", async () => {
    const result = (await invokeTool("agentkey_verify", {})) as {
      status: string;
    };
    assert.equal(result.status, "error");
  });

  it("invokeTool dispatches revoke with proof", async () => {
    const keys = generateKeyPair();
    const issued = await agentkeyIssue({
      publicHandle: `mcp-invoke-revoke-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    const proof = createOwnershipProof({
      agentId: issued.agent.id,
      challenge: "invoke-revoke",
      privateKey: keys.privateKey,
    });
    const result = (await invokeTool("agentkey_revoke", {
      idOrHandle: issued.agent.id,
      proof,
    })) as { ok: boolean; agent?: { status: string } };
    assert.equal(result.ok, true);
    assert.equal(result.agent?.status, "revoked");
  });
});
