import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agentkeyVerify } from "./tools.js";

describe("agentkey_verify", () => {
  it("fails closed on missing inputs", () => {
    const result = agentkeyVerify({});
    assert.equal(result.status, "error");
  });
});
