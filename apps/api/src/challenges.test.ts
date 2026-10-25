import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkChallenge,
  consumeChallenge,
  isServerChallenge,
  issueChallenge,
  resetChallenges,
} from "./challenges.js";

describe("one-time challenges", () => {
  beforeEach(() => resetChallenges());

  it("issues unique, prefixed challenges with an expiry", () => {
    const a = issueChallenge("verify");
    const b = issueChallenge("verify");
    assert.notEqual(a.challenge, b.challenge);
    assert.ok(isServerChallenge(a.challenge));
    assert.ok(Date.parse(a.expiresAt) > Date.now());
  });

  it("works once", () => {
    const { challenge } = issueChallenge("verify");
    assert.deepEqual(checkChallenge(challenge, "verify"), { ok: true });
    consumeChallenge(challenge);
    assert.equal(checkChallenge(challenge, "verify").ok, false);
  });

  it("expires", () => {
    const now = Date.now();
    const { challenge } = issueChallenge("verify", now);
    const later = checkChallenge(challenge, "verify", now + 6 * 60 * 1000);
    assert.deepEqual(later, { ok: false, reason: "challenge expired" });
  });

  it("is bound to one purpose", () => {
    const { challenge } = issueChallenge("verify");
    const check = checkChallenge(challenge, "revoke");
    assert.equal(check.ok, false);
  });

  it("rejects unknown purposes", () => {
    assert.throws(() => issueChallenge("admin" as never));
  });
});
