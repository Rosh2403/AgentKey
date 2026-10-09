import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateIssuerKeyPair,
  issuerKeySourcesFromEnv,
  loadIssuerKeyPair,
} from "./issuer-keys.js";

describe("issuer key ops", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads from key files", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentkey-issuer-"));
    dirs.push(dir);
    const privateKeyPath = join(dir, "issuer.priv");
    const publicKeyPath = join(dir, "issuer.pub");
    const generated = generateIssuerKeyPair({ privateKeyPath, publicKeyPath });
    assert.match(readFileSync(privateKeyPath, "utf8").trim(), /^[0-9a-f]{64}$/i);

    const loaded = loadIssuerKeyPair({
      privateKeyFile: privateKeyPath,
      publicKeyFile: publicKeyPath,
    });
    assert.equal(loaded.ephemeral, false);
    assert.equal(loaded.publicKey, generated.publicKey);
    assert.equal(loaded.privateKey, generated.privateKey);
  });

  it("prefers inline env over files", () => {
    const a = generateIssuerKeyPair();
    const b = generateIssuerKeyPair();
    const dir = mkdtempSync(join(tmpdir(), "agentkey-issuer-"));
    dirs.push(dir);
    const privateKeyPath = join(dir, "issuer.priv");
    const publicKeyPath = join(dir, "issuer.pub");
    generateIssuerKeyPair({ privateKeyPath, publicKeyPath });

    const loaded = loadIssuerKeyPair({
      privateKey: a.privateKey,
      publicKey: a.publicKey,
      privateKeyFile: privateKeyPath,
      publicKeyFile: publicKeyPath,
    });
    assert.equal(loaded.publicKey, a.publicKey);
    assert.notEqual(loaded.publicKey, b.publicKey);
  });

  it("issuerKeySourcesFromEnv maps file paths", () => {
    const sources = issuerKeySourcesFromEnv({
      AGENTKEY_ISSUER_PRIVATE_KEY_FILE: "./.secrets/issuer.priv",
      AGENTKEY_ISSUER_PUBLIC_KEY_FILE: "./.secrets/issuer.pub",
    });
    assert.equal(sources.privateKeyFile, "./.secrets/issuer.priv");
    assert.equal(sources.publicKeyFile, "./.secrets/issuer.pub");
  });
});
