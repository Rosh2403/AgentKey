import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createOwnershipProof,
  generateKeyPair,
} from "@agentkey/crypto";
import {
  issueAgent,
  resolveAgent,
  revokeAgentIdentity,
  verifyAgent,
} from "./handlers.js";
import { clearStoreForTests } from "./store.js";
import { resetIssuerKeysForTests, setIssuerKeysForTests } from "./issuer.js";

describe("api handlers", () => {
  beforeEach(() => {
    clearStoreForTests();
    resetIssuerKeysForTests();
    setIssuerKeysForTests(generateKeyPair());
  });

  it("issues dual ids and resolves without private subject by default", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `demo-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    assert.ok(issued.id.startsWith("ak_"));
    assert.ok(issued.privateSubject?.startsWith("subj_"));
    assert.equal(issued.issuerId, "agentkey:root");
    assert.equal(issued.status, "active");
    assert.ok(issued.issuerAttestation);

    const publicView = resolveAgent({ idOrHandle: issued.publicHandle });
    assert.ok(!("error" in publicView));
    if (!("error" in publicView)) {
      assert.equal(publicView.privateSubject, undefined);
      assert.equal(publicView.publicKey, keys.publicKey);
    }

    const privateView = resolveAgent({
      idOrHandle: issued.id,
      includePrivateSubject: true,
    });
    assert.ok(!("error" in privateView));
    if (!("error" in privateView)) {
      assert.equal(privateView.privateSubject, issued.privateSubject);
    }
  });

  it("rejects invalid public keys at issue", async () => {
    await assert.rejects(
      () =>
        issueAgent({
          publicHandle: "bad-key-bot",
          publicKey: "not-a-key",
        }),
      /Ed25519/,
    );
  });

  it("verify happy path: register → prove → valid", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `verify-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const proof = createOwnershipProof({
      agentId: issued.id,
      challenge: "third-party-challenge",
      privateKey: keys.privateKey,
    });
    const result = verifyAgent({ agentId: issued.id, proof });
    assert.equal(result.status, "valid");
  });

  it("verify fails closed on missing proof", () => {
    const result = verifyAgent({ agentId: "missing", proof: "" });
    assert.equal(result.status, "error");
  });

  it("verify fails closed on malformed proof", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `malformed-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const result = verifyAgent({
      agentId: issued.id,
      proof: "not-json-proof",
    });
    assert.equal(result.status, "error");
  });

  it("verify returns invalid for wrong key", async () => {
    const keys = generateKeyPair();
    const other = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `wrong-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const proof = createOwnershipProof({
      agentId: issued.id,
      challenge: "c",
      privateKey: other.privateKey,
    });
    const result = verifyAgent({ agentId: issued.id, proof });
    assert.equal(result.status, "invalid");
  });

  it("verify returns unknown for missing agent", () => {
    const keys = generateKeyPair();
    const proof = createOwnershipProof({
      agentId: "ak_does_not_exist",
      challenge: "c",
      privateKey: keys.privateKey,
    });
    const result = verifyAgent({ agentId: "ak_does_not_exist", proof });
    assert.equal(result.status, "unknown");
  });

  it("verify returns revoked after revoke", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `revoked-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const revoked = await revokeAgentIdentity(issued.id);
    assert.ok(!("error" in revoked));
    const proof = createOwnershipProof({
      agentId: issued.id,
      challenge: "c",
      privateKey: keys.privateKey,
    });
    const result = verifyAgent({ agentId: issued.id, proof });
    assert.equal(result.status, "revoked");
  });

  it("issue with commitOnChain fails closed when registry env missing", async () => {
    const keys = generateKeyPair();
    await assert.rejects(
      () =>
        issueAgent({
          publicHandle: `anchor-${Date.now()}`,
          publicKey: keys.publicKey,
          commitOnChain: true,
        }),
      /AGENTKEY_ANCHOR_ENABLED|registry/,
    );
  });
});
