import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AgentkeyClient } from "./index.js";

describe("AgentkeyClient", () => {
  it("fails closed on verify transport errors", async () => {
    const client = new AgentkeyClient({
      baseUrl: "http://127.0.0.1:1",
    });
    const result = await client.verify({
      agentId: "ak_demo",
      proof: "stub",
    });
    assert.equal(result.status, "error");
    assert.ok(result.reason);
  });
});
