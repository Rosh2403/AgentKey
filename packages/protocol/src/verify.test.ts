import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { failClosed } from "./index.js";

describe("failClosed", () => {
  it("returns error status", () => {
    const result = failClosed("malformed proof");
    assert.equal(result.status, "error");
    assert.equal(result.reason, "malformed proof");
  });
});
