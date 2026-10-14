/**
 * Adversarial / security-stress coverage for authz, verify, revoke, issue.
 * Complements handlers.test.ts and authz.test.ts with cross-agent and
 * malformed-input cases that an attacker would try.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createOwnershipProof,
  generateKeyPair,
} from "@agentkey/crypto";
import { encodeOwnershipProof } from "@agentkey/protocol";
import {
  authorizeAgentControl,
  proveSubjectControl,
  safeEqualString,
} from "./authz.js";
import {
  assertValidPublicHandle,
  issueAgent,
  resolveAgent,
  revokeAgentIdentity,
  verifyAgent,
} from "./handlers.js";
import { clearStoreForTests, getAgent, putNewAgent } from "./store.js";
import { resetIssuerKeysForTests, setIssuerKeysForTests } from "./issuer.js";

describe("adversarial security stress", () => {
  beforeEach(() => {
    clearStoreForTests();
    resetIssuerKeysForTests();
    setIssuerKeysForTests(generateKeyPair());
    delete process.env.AGENTKEY_ISSUER_ADMIN_TOKEN;
  });

  it("cross-agent IDOR: proof for A cannot revoke B", async () => {
    const keysA = generateKeyPair();
    const keysB = generateKeyPair();
    const a = await issueAgent({
      publicHandle: `idor-a-${Date.now()}`,
      publicKey: keysA.publicKey,
    });
    const b = await issueAgent({
      publicHandle: `idor-b-${Date.now()}`,
      publicKey: keysB.publicKey,
    });
    const proofA = createOwnershipProof({
      agentId: a.id,
      challenge: "revoke-b",
      privateKey: keysA.privateKey,
    });
    const denied = await revokeAgentIdentity({
      idOrHandle: b.id,
      proof: proofA,
    });
    assert.ok("error" in denied);
    if ("error" in denied) assert.equal(denied.error, "forbidden");
    const still = resolveAgent({ idOrHandle: b.id });
    assert.ok(!("error" in still));
    if (!("error" in still)) assert.equal(still.status, "active");
  });

  it("cross-agent IDOR: proof for A cannot read B private subject", async () => {
    const keysA = generateKeyPair();
    const keysB = generateKeyPair();
    const a = await issueAgent({
      publicHandle: `priv-a-${Date.now()}`,
      publicKey: keysA.publicKey,
    });
    const b = await issueAgent({
      publicHandle: `priv-b-${Date.now()}`,
      publicKey: keysB.publicKey,
    });
    const proofA = createOwnershipProof({
      agentId: a.id,
      challenge: "read-b",
      privateKey: keysA.privateKey,
    });
    const denied = resolveAgent({
      idOrHandle: b.id,
      includePrivateSubject: true,
      proof: proofA,
    });
    assert.ok("error" in denied);
    if ("error" in denied) {
      assert.equal(denied.error, "forbidden");
      assert.ok(!("privateSubject" in denied));
    }
  });

  it("proof signed over wrong agentId string is rejected for authz", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `wrong-id-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    // Attacker signs over a different id string than the stored canonical id.
    const proof = createOwnershipProof({
      agentId: "ak_attacker_chosen",
      challenge: "c",
      privateKey: keys.privateKey,
    });
    const owned = proveSubjectControl({
      agentId: issued.id,
      publicKey: keys.publicKey,
      proof,
    });
    assert.equal(owned.ok, false);
  });

  it("replayed ownership proof still authorizes today (documented residual)", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `replay-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const proof = createOwnershipProof({
      agentId: issued.id,
      challenge: "static-challenge",
      privateKey: keys.privateKey,
    });
    const first = resolveAgent({
      idOrHandle: issued.id,
      includePrivateSubject: true,
      proof,
    });
    const second = resolveAgent({
      idOrHandle: issued.id,
      includePrivateSubject: true,
      proof,
    });
    assert.ok(!("error" in first));
    assert.ok(!("error" in second));
    // Residual: no nonce/TTL — captured proofs remain reusable until revoke.
  });

  it("wrong-key verify → invalid; malformed → error; unknown → unknown", async () => {
    const keys = generateKeyPair();
    const other = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `vk-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const wrong = createOwnershipProof({
      agentId: issued.id,
      challenge: "c",
      privateKey: other.privateKey,
    });
    assert.equal(
      verifyAgent({ agentId: issued.id, proof: wrong }).status,
      "invalid",
    );
    assert.equal(
      verifyAgent({ agentId: issued.id, proof: "{" }).status,
      "error",
    );
    assert.equal(
      verifyAgent({
        agentId: issued.id,
        proof: encodeOwnershipProof({
          challenge: "c",
          signature: "not-hex",
        }),
      }).status,
      "invalid",
    );
    assert.equal(
      verifyAgent({
        agentId: issued.id,
        proof: JSON.stringify({ challenge: "", signature: "ab".repeat(64) }),
      }).status,
      "error",
    );
    const phantom = createOwnershipProof({
      agentId: "ak_missing",
      challenge: "c",
      privateKey: keys.privateKey,
    });
    assert.equal(
      verifyAgent({ agentId: "ak_missing", proof: phantom }).status,
      "unknown",
    );
  });

  it("public resolve never leaks privateSubject even after authorized read", async () => {
    const keys = generateKeyPair();
    const issued = await issueAgent({
      publicHandle: `noleak-${Date.now()}`,
      publicKey: keys.publicKey,
    });
    const proof = createOwnershipProof({
      agentId: issued.id,
      challenge: "once",
      privateKey: keys.privateKey,
    });
    const priv = resolveAgent({
      idOrHandle: issued.id,
      includePrivateSubject: true,
      proof,
    });
    assert.ok(!("error" in priv));
    const pub = resolveAgent({ idOrHandle: issued.id });
    assert.ok(!("error" in pub));
    if (!("error" in pub)) {
      assert.equal(pub.privateSubject, undefined);
    }
  });

  it("duplicate publicHandle is rejected (atomic putNewAgent)", async () => {
    const keys = generateKeyPair();
    const handle = `dup-${Date.now()}`;
    await issueAgent({ publicHandle: handle, publicKey: keys.publicKey });
    await assert.rejects(
      () =>
        issueAgent({
          publicHandle: handle,
          publicKey: generateKeyPair().publicKey,
        }),
      /already registered/,
    );
    await assert.rejects(
      () =>
        issueAgent({
          publicHandle: handle.toUpperCase(),
          publicKey: generateKeyPair().publicKey,
        }),
      /already registered/,
    );
  });

  it("putNewAgent refuses colliding handle under concurrent-style second insert", () => {
    const a = {
      id: "ak_one",
      publicHandle: "race-bot",
      privateSubject: "subj_one",
      publicKey: "aa".repeat(32),
      issuerId: "agentkey:root",
      status: "active" as const,
      createdAt: new Date().toISOString(),
    };
    const b = {
      ...a,
      id: "ak_two",
      privateSubject: "subj_two",
      publicKey: "bb".repeat(32),
    };
    assert.equal(putNewAgent(a), true);
    assert.equal(putNewAgent(b), false);
    assert.equal(getAgent("race-bot")?.id, "ak_one");
  });

  it("rejects publicHandle with newline / control chars (canonical injection)", async () => {
    assert.throws(() => assertValidPublicHandle("evil\nhandle"), /control/);
    assert.throws(() => assertValidPublicHandle("evil\rhandle"), /control/);
    assert.throws(() => assertValidPublicHandle("a\u0000b"), /control/);
    const keys = generateKeyPair();
    await assert.rejects(
      () =>
        issueAgent({
          publicHandle: `bad\n${Date.now()}`,
          publicKey: keys.publicKey,
        }),
      /control/,
    );
  });

  it("wrong admin token is forbidden when admin enabled; length mismatch still false", () => {
    const keys = generateKeyPair();
    const agent = {
      id: "ak_admin",
      publicHandle: "admin-bot",
      privateSubject: "subj_admin",
      publicKey: keys.publicKey,
      issuerId: "agentkey:root",
      status: "active" as const,
      createdAt: new Date().toISOString(),
    };
    const env = { AGENTKEY_ISSUER_ADMIN_TOKEN: "correct-admin-token" };
    const wrong = authorizeAgentControl(
      agent,
      { bearerToken: "short" },
      env,
    );
    assert.equal(wrong.ok, false);
    if (!wrong.ok) assert.equal(wrong.error, "forbidden");
    assert.equal(safeEqualString("a", "bb"), false);
    assert.equal(safeEqualString("same", "same"), true);
  });

  it("empty / whitespace proof shapes fail closed for authz", () => {
    const keys = generateKeyPair();
    const agent = {
      id: "ak_empty",
      publicHandle: "empty-bot",
      privateSubject: "subj_empty",
      publicKey: keys.publicKey,
      issuerId: "agentkey:root",
      status: "active" as const,
      createdAt: new Date().toISOString(),
    };
    assert.equal(
      authorizeAgentControl(agent, { proof: "   " }, {}).ok,
      false,
    );
    const malformed = authorizeAgentControl(
      agent,
      { proof: '{"challenge":"x"}' },
      {},
    );
    assert.equal(malformed.ok, false);
    if (!malformed.ok) assert.equal(malformed.error, "forbidden");
  });
});
