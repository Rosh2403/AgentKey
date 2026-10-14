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
    delete process.env.AGENTKEY_ISSUER_ADMIN_TOKEN;
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
  });

  it("private subject without auth is denied (never returned)", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `priv-${Date.now()}`,
      publicKey: keys.publicKey,
    });

    const denied = resolveAgent({
      idOrHandle: issued.id,
      includePrivateSubject: true,
    });
    assert.equal("error" in denied && denied.error, "unauthorized");
    if ("error" in denied) {
      assert.equal(denied.error, "unauthorized");
    }
  });

  it("private subject with ownership proof is returned", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `priv-ok-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const proof = createOwnershipProof({
      agentId: issued.id,
      challenge: "private-read",
      privateKey: keys.privateKey,
    });
    const privateView = resolveAgent({
      idOrHandle: issued.id,
      includePrivateSubject: true,
      proof,
    });
    assert.ok(!("error" in privateView));
    if (!("error" in privateView)) {
      assert.equal(privateView.privateSubject, issued.privateSubject);
    }
  });

  it("private subject with wrong key is forbidden", async () => {
    const keys = generateKeyPair();
    const other = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `priv-bad-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const proof = createOwnershipProof({
      agentId: issued.id,
      challenge: "private-read",
      privateKey: other.privateKey,
    });
    const denied = resolveAgent({
      idOrHandle: issued.id,
      includePrivateSubject: true,
      proof,
    });
    assert.ok("error" in denied);
    if ("error" in denied) {
      assert.equal(denied.error, "forbidden");
    }
  });

  it("private subject with issuer admin token when enabled", async () => {
    process.env.AGENTKEY_ISSUER_ADMIN_TOKEN = "test-admin-token";
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `priv-admin-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const privateView = resolveAgent(
      {
        idOrHandle: issued.id,
        includePrivateSubject: true,
      },
      { bearerToken: "test-admin-token" },
    );
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

  it("unauthorized revoke without proof is denied", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `revoke-unauth-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const denied = await revokeAgentIdentity({ idOrHandle: issued.id });
    assert.ok("error" in denied);
    if ("error" in denied) {
      assert.equal(denied.error, "unauthorized");
    }
    const stillActive = resolveAgent({ idOrHandle: issued.id });
    assert.ok(!("error" in stillActive));
    if (!("error" in stillActive)) {
      assert.equal(stillActive.status, "active");
    }
  });

  it("unauthorized revoke with wrong key is forbidden", async () => {
    const keys = generateKeyPair();
    const other = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `revoke-wrong-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const proof = createOwnershipProof({
      agentId: issued.id,
      challenge: "revoke",
      privateKey: other.privateKey,
    });
    const denied = await revokeAgentIdentity({
      idOrHandle: issued.id,
      proof,
    });
    assert.ok("error" in denied);
    if ("error" in denied) {
      assert.equal(denied.error, "forbidden");
    }
  });

  it("unauthorized revoke for unknown agent is denied", async () => {
    const keys = generateKeyPair();
    const proof = createOwnershipProof({
      agentId: "ak_does_not_exist",
      challenge: "revoke",
      privateKey: keys.privateKey,
    });
    const denied = await revokeAgentIdentity({
      idOrHandle: "ak_does_not_exist",
      proof,
    });
    assert.ok("error" in denied);
    if ("error" in denied) {
      assert.equal(denied.error, "not_found");
    }
  });

  it("unauthorized revoke with no proof for unknown agent is unauthorized", async () => {
    const denied = await revokeAgentIdentity({
      idOrHandle: "ak_missing",
    });
    assert.ok("error" in denied);
    if ("error" in denied) {
      assert.equal(denied.error, "unauthorized");
    }
  });

  it("authorized revoke with ownership proof works; verify → revoked", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `revoked-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const revokeProof = createOwnershipProof({
      agentId: issued.id,
      challenge: "revoke-now",
      privateKey: keys.privateKey,
    });
    const revoked = await revokeAgentIdentity({
      idOrHandle: issued.id,
      proof: revokeProof,
    });
    assert.ok(!("error" in revoked));
    if (!("error" in revoked)) {
      assert.equal(revoked.status, "revoked");
      assert.equal(revoked.privateSubject, undefined);
    }
    const proof = createOwnershipProof({
      agentId: issued.id,
      challenge: "c",
      privateKey: keys.privateKey,
    });
    const result = verifyAgent({ agentId: issued.id, proof });
    assert.equal(result.status, "revoked");
  });

  it("authorized revoke via issuer admin token when enabled", async () => {
    process.env.AGENTKEY_ISSUER_ADMIN_TOKEN = "revoke-admin";
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `revoked-admin-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const revoked = await revokeAgentIdentity(
      { idOrHandle: issued.id },
      { bearerToken: "revoke-admin" },
    );
    assert.ok(!("error" in revoked));
    if (!("error" in revoked)) {
      assert.equal(revoked.status, "revoked");
    }
  });

  it("issuer admin token off by default even if bearer sent", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `revoked-noadmin-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const denied = await revokeAgentIdentity(
      { idOrHandle: issued.id },
      { bearerToken: "guess" },
    );
    assert.ok("error" in denied);
    if ("error" in denied) {
      assert.equal(denied.error, "unauthorized");
    }
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
