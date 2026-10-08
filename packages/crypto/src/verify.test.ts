import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyProof } from "./index.js";

describe("verifyProof", () => {
  it("fails closed when proof missing", () => {
    const result = verifyProof({ agentId: "ak_1", proof: "" });
    assert.equal(result.status, "error");
  });

  it("returns unknown for stub path when inputs present", () => {
    const result = verifyProof({ agentId: "ak_1", proof: "deadbeef" });
    assert.equal(result.status, "unknown");
  });
});
