import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createOwnershipProof,
  generateKeyPair,
} from "@agentkey/crypto";
import {
  authorizeAgentControl,
  parseBearerToken,
  proveSubjectControl,
  resolveIssuerAdminToken,
} from "./authz.js";
import type { StoredAgent } from "./store.js";

function sampleAgent(publicKey: string): StoredAgent {
  return {
    id: "ak_authz_demo",
    publicHandle: "authz-bot",
    privateSubject: "subj_authz",
    publicKey,
    issuerId: "agentkey:root",
    status: "active",
    createdAt: new Date().toISOString(),
  };
}

describe("authz", () => {
  it("resolveIssuerAdminToken is off when unset or blank", () => {
    assert.equal(resolveIssuerAdminToken({}), undefined);
    assert.equal(
      resolveIssuerAdminToken({ AGENTKEY_ISSUER_ADMIN_TOKEN: "  " }),
      undefined,
    );
    assert.equal(
      resolveIssuerAdminToken({ AGENTKEY_ISSUER_ADMIN_TOKEN: "secret-token" }),
      "secret-token",
    );
  });

  it("parseBearerToken extracts token", () => {
    assert.equal(parseBearerToken(undefined), undefined);
    assert.equal(parseBearerToken("Bearer abc"), "abc");
    assert.equal(parseBearerToken("bearer xyz"), "xyz");
  });

  it("proveSubjectControl accepts matching ownership proof", () => {
    const keys = generateKeyPair();
    const proof = createOwnershipProof({
      agentId: "ak_authz_demo",
      challenge: "revoke-1",
      privateKey: keys.privateKey,
    });
    const ok = proveSubjectControl({
      agentId: "ak_authz_demo",
      publicKey: keys.publicKey,
      proof,
    });
    assert.equal(ok.ok, true);
  });

  it("authorizeAgentControl: ownership proof", () => {
    const keys = generateKeyPair();
    const agent = sampleAgent(keys.publicKey);
    const proof = createOwnershipProof({
      agentId: agent.id,
      challenge: "c",
      privateKey: keys.privateKey,
    });
    const decision = authorizeAgentControl(agent, { proof }, {});
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.via, "ownership");
  });

  it("authorizeAgentControl: wrong key → forbidden", () => {
    const keys = generateKeyPair();
    const other = generateKeyPair();
    const agent = sampleAgent(keys.publicKey);
    const proof = createOwnershipProof({
      agentId: agent.id,
      challenge: "c",
      privateKey: other.privateKey,
    });
    const decision = authorizeAgentControl(agent, { proof }, {});
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.error, "forbidden");
  });

  it("authorizeAgentControl: missing creds → unauthorized", () => {
    const keys = generateKeyPair();
    const decision = authorizeAgentControl(sampleAgent(keys.publicKey), {}, {});
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.error, "unauthorized");
  });

  it("authorizeAgentControl: issuer admin when enabled", () => {
    const keys = generateKeyPair();
    const env = { AGENTKEY_ISSUER_ADMIN_TOKEN: "admin-secret" };
    const decision = authorizeAgentControl(
      sampleAgent(keys.publicKey),
      { bearerToken: "admin-secret" },
      env,
    );
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.via, "issuer_admin");
  });

  it("authorizeAgentControl: admin disabled ignores bearer", () => {
    const keys = generateKeyPair();
    const decision = authorizeAgentControl(
      sampleAgent(keys.publicKey),
      { bearerToken: "anything" },
      {},
    );
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.error, "unauthorized");
  });
});
