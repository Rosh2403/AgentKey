import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createOwnershipProof,
  generateKeyPair,
  loadIssuerKeyPair,
  createIssuerAttestation,
  verifyProof,
} from "./index.js";

describe("verifyProof", () => {
  it("fails closed when proof missing", () => {
    const result = verifyProof({ agentId: "ak_1", proof: "" });
    assert.equal(result.status, "error");
  });

  it("fails closed on malformed proof JSON", () => {
    const result = verifyProof({ agentId: "ak_1", proof: "not-json" });
    assert.equal(result.status, "error");
    assert.match(result.reason ?? "", /JSON/i);
  });

  it("returns unknown when agent is not resolved", () => {
    const keys = generateKeyPair();
    const proof = createOwnershipProof({
      agentId: "ak_missing",
      challenge: "chal-1",
      privateKey: keys.privateKey,
    });
    const result = verifyProof({ agentId: "ak_missing", proof });
    assert.equal(result.status, "unknown");
  });

  it("returns valid for a correct ownership proof", () => {
    const subject = generateKeyPair();
    const issuer = generateKeyPair();
    const agentId = "ak_demo";
    const attestation = createIssuerAttestation({
      id: agentId,
      publicHandle: "demo",
      privateSubject: "subj_demo",
      publicKey: subject.publicKey,
      issuerPrivateKey: issuer.privateKey,
    });
    const proof = createOwnershipProof({
      agentId,
      challenge: "login-123",
      privateKey: subject.privateKey,
    });
    const result = verifyProof(
      { agentId, proof },
      {
        publicKey: subject.publicKey,
        status: "active",
        publicHandle: "demo",
        privateSubject: "subj_demo",
        issuerAttestation: attestation,
      },
      { issuerPublicKey: issuer.publicKey },
    );
    assert.equal(result.status, "valid");
  });

  it("returns invalid for a wrong signature", () => {
    const subject = generateKeyPair();
    const other = generateKeyPair();
    const agentId = "ak_demo";
    const proof = createOwnershipProof({
      agentId,
      challenge: "login-123",
      privateKey: other.privateKey,
    });
    const result = verifyProof(
      { agentId, proof },
      {
        publicKey: subject.publicKey,
        status: "active",
        publicHandle: "demo",
        privateSubject: "subj_demo",
      },
    );
    assert.equal(result.status, "invalid");
  });

  it("returns revoked when agent is revoked", () => {
    const subject = generateKeyPair();
    const agentId = "ak_revoked";
    const proof = createOwnershipProof({
      agentId,
      challenge: "x",
      privateKey: subject.privateKey,
    });
    const result = verifyProof(
      { agentId, proof },
      {
        publicKey: subject.publicKey,
        status: "revoked",
        publicHandle: "r",
        privateSubject: "s",
      },
    );
    assert.equal(result.status, "revoked");
  });

  it("fails closed when issuer attestation is present but issuer key missing", () => {
    const subject = generateKeyPair();
    const issuer = generateKeyPair();
    const agentId = "ak_demo";
    const attestation = createIssuerAttestation({
      id: agentId,
      publicHandle: "demo",
      privateSubject: "subj_demo",
      publicKey: subject.publicKey,
      issuerPrivateKey: issuer.privateKey,
    });
    const proof = createOwnershipProof({
      agentId,
      challenge: "c",
      privateKey: subject.privateKey,
    });
    const result = verifyProof(
      { agentId, proof },
      {
        publicKey: subject.publicKey,
        status: "active",
        publicHandle: "demo",
        privateSubject: "subj_demo",
        issuerAttestation: attestation,
      },
    );
    assert.equal(result.status, "error");
  });
});

describe("loadIssuerKeyPair", () => {
  it("generates ephemeral keys when env empty", () => {
    const keys = loadIssuerKeyPair({});
    assert.equal(keys.ephemeral, true);
    assert.equal(keys.publicKey.length, 64);
  });

  it("rejects mismatched configured keys", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    assert.throws(() =>
      loadIssuerKeyPair({
        privateKey: a.privateKey,
        publicKey: b.publicKey,
      }),
    );
  });
});
