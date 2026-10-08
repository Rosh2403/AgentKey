import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encodeOwnershipProof,
  failClosed,
  parseOwnershipProof,
  canonicalVerifyMessage,
  canonicalIssueMessage,
} from "./index.js";

describe("failClosed", () => {
  it("returns error status", () => {
    const result = failClosed("malformed proof");
    assert.equal(result.status, "error");
    assert.equal(result.reason, "malformed proof");
  });
});

describe("ownership proof codec", () => {
  it("round-trips a proof", () => {
    const encoded = encodeOwnershipProof({
      challenge: "c1",
      signature: "ab".repeat(64),
    });
    const parsed = parseOwnershipProof(encoded);
    assert.ok(!("error" in parsed));
    if (!("error" in parsed)) {
      assert.equal(parsed.challenge, "c1");
      assert.equal(parsed.signature, "ab".repeat(64));
    }
  });

  it("rejects non-json proofs", () => {
    const parsed = parseOwnershipProof("not-json");
    assert.ok("error" in parsed);
  });
});

describe("canonical messages", () => {
  it("includes agent id and challenge", () => {
    const msg = canonicalVerifyMessage("ak_1", "chal");
    assert.match(msg, /ak_1/);
    assert.match(msg, /chal/);
  });

  it("binds dual ids and pubkey at issue", () => {
    const msg = canonicalIssueMessage({
      id: "ak_1",
      publicHandle: "bot",
      privateSubject: "subj",
      publicKey: "aa".repeat(32),
    });
    assert.match(msg, /bot/);
    assert.match(msg, /subj/);
  });
});
