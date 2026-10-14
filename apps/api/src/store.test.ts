import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  STORE_SCHEMA_VERSION,
  clearStoreForTests,
  enableDurableStoreDefault,
  getAgent,
  putAgent,
  putNewAgent,
  resetStoreForTests,
  resolveStoreBackend,
  revokeAgent,
  type StoredAgent,
} from "./store.js";

function sampleAgent(id: string): StoredAgent {
  return {
    id,
    publicHandle: `handle-${id}`,
    privateSubject: `subj-${id}`,
    publicKey: "aa".repeat(32),
    issuerId: "agentkey:root",
    status: "active",
    createdAt: new Date().toISOString(),
  };
}

describe("durable store", () => {
  let dir: string;
  let prevStore: string | undefined;
  let prevPath: string | undefined;
  let prevDurable: string | undefined;

  beforeEach(() => {
    prevStore = process.env.AGENTKEY_STORE;
    prevPath = process.env.AGENTKEY_STORE_PATH;
    prevDurable = process.env.AGENTKEY_STORE_DURABLE_DEFAULT;
    dir = mkdtempSync(join(tmpdir(), "agentkey-store-"));
    process.env.AGENTKEY_STORE = "file";
    process.env.AGENTKEY_STORE_PATH = join(dir, "agents.json");
    delete process.env.AGENTKEY_STORE_DURABLE_DEFAULT;
    resetStoreForTests();
  });

  afterEach(() => {
    if (prevStore === undefined) delete process.env.AGENTKEY_STORE;
    else process.env.AGENTKEY_STORE = prevStore;
    if (prevPath === undefined) delete process.env.AGENTKEY_STORE_PATH;
    else process.env.AGENTKEY_STORE_PATH = prevPath;
    if (prevDurable === undefined) delete process.env.AGENTKEY_STORE_DURABLE_DEFAULT;
    else process.env.AGENTKEY_STORE_DURABLE_DEFAULT = prevDurable;
    clearStoreForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists agents with schema version and reloads", () => {
    assert.equal(resolveStoreBackend(), "file");
    putAgent(sampleAgent("ak_persist"));
    const onDisk = JSON.parse(
      readFileSync(process.env.AGENTKEY_STORE_PATH!, "utf8"),
    ) as { version: number; agents: StoredAgent[] };
    assert.equal(onDisk.version, STORE_SCHEMA_VERSION);
    assert.equal(onDisk.agents.length, 1);

    resetStoreForTests();
    const loaded = getAgent("ak_persist");
    assert.ok(loaded);
    assert.equal(loaded?.publicHandle, "handle-ak_persist");
  });

  it("persists revocation across reload", () => {
    putAgent(sampleAgent("ak_rev"));
    revokeAgent("ak_rev");
    resetStoreForTests();
    assert.equal(getAgent("ak_rev")?.status, "revoked");
  });

  it("enableDurableStoreDefault selects file backend", () => {
    delete process.env.AGENTKEY_STORE;
    delete process.env.AGENTKEY_STORE_PATH;
    enableDurableStoreDefault();
    assert.equal(resolveStoreBackend(), "file");
  });

  it("putNewAgent is atomic for handle uniqueness", () => {
    assert.equal(putNewAgent(sampleAgent("ak_first")), true);
    const collision: StoredAgent = {
      ...sampleAgent("ak_second"),
      publicHandle: "handle-ak_first",
    };
    assert.equal(putNewAgent(collision), false);
    assert.equal(getAgent("handle-ak_first")?.id, "ak_first");
  });
});
