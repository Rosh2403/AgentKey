import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  computeAgentIdHash,
  computeCommitment,
  readRegistryConfig,
  commitAnchor,
} from "./registry.js";

const AGENT_ID = "ak_0123456789abcdef0123456789abcdef";
const PUBKEY =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("registry hybrid commitment", () => {
  const saved = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, saved);
  });

  it("hashes match Solidity string.concat scheme (known vector)", () => {
    const commitment = computeCommitment(AGENT_ID, PUBKEY);
    const agentIdHash = computeAgentIdHash(AGENT_ID);
    // Locked vector — must stay aligned with contracts/test/AgentkeyRegistry.t.sol
    assert.equal(
      commitment,
      "0x74c7aa5e7aa4bf409c33f4950813f284e77d861d0696650eed925fe362774489",
    );
    assert.equal(
      agentIdHash,
      "0x21cb5cd9d0c23fd1eafcb06dd5c1ec225c542919b9592d1713063f7fdfa5b82d",
    );
    assert.notEqual(
      computeCommitment(AGENT_ID, "b".repeat(64)),
      commitment,
    );
  });

  it("readRegistryConfig returns null when anchor disabled", () => {
    process.env.AGENTKEY_ANCHOR_ENABLED = "false";
    assert.equal(readRegistryConfig(), null);
  });

  it("readRegistryConfig ignores optional ERC-8004 when anchor disabled", () => {
    process.env.AGENTKEY_ANCHOR_ENABLED = "false";
    process.env.AGENTKEY_ERC8004_ADDRESS = "0x0000000000000000000000000000000000000001";
    assert.equal(readRegistryConfig(), null);
  });

  it("readRegistryConfig errors when enabled but incomplete", () => {
    process.env.AGENTKEY_ANCHOR_ENABLED = "true";
    delete process.env.AGENTKEY_REGISTRY_RPC_URL;
    delete process.env.AGENTKEY_REGISTRY_ADDRESS;
    delete process.env.AGENTKEY_REGISTRY_PRIVATE_KEY;
    const cfg = readRegistryConfig();
    assert.ok(cfg && "error" in cfg);
  });

  it("commitAnchor throws when not configured", async () => {
    process.env.AGENTKEY_ANCHOR_ENABLED = "false";
    await assert.rejects(
      () => commitAnchor({ agentId: AGENT_ID, publicKey: PUBKEY }),
      /AGENTKEY_ANCHOR_ENABLED/,
    );
  });
});
