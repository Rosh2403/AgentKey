import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { issueAgent, resolveAgent, verifyAgent } from "./handlers.js";

describe("api handlers", () => {
  it("issues and resolves public handle without private subject by default", async () => {
    const issued = await issueAgent({
      publicHandle: `demo-${Date.now()}`,
      publicKey: "stub-pubkey",
    });
    assert.ok(issued.id.startsWith("ak_"));
    assert.equal(issued.issuerId, "agentkey:root");

    const publicView = resolveAgent({ idOrHandle: issued.publicHandle });
    assert.ok(!("error" in publicView));
    if (!("error" in publicView)) {
      assert.equal(publicView.privateSubject, undefined);
    }
  });

  it("verify fails closed on missing proof", () => {
    const result = verifyAgent({ agentId: "missing", proof: "" });
    assert.equal(result.status, "error");
  });
});
