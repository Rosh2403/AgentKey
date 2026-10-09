import { loadIssuerKeyPair, type KeyPairHex } from "@agentkey/crypto";

let cached: (KeyPairHex & { ephemeral: boolean }) | undefined;

/** Single root issuer key material for this process. */
export function getIssuerKeys(): KeyPairHex & { ephemeral: boolean } {
  if (!cached) {
    const env: { privateKey?: string; publicKey?: string } = {};
    if (process.env.AGENTKEY_ISSUER_PRIVATE_KEY !== undefined) {
      env.privateKey = process.env.AGENTKEY_ISSUER_PRIVATE_KEY;
    }
    if (process.env.AGENTKEY_ISSUER_PUBLIC_KEY !== undefined) {
      env.publicKey = process.env.AGENTKEY_ISSUER_PUBLIC_KEY;
    }
    cached = loadIssuerKeyPair(env);
    if (cached.ephemeral) {
      // eslint-disable-next-line no-console
      console.warn(
        "[agentkey] issuer keys not set — using ephemeral in-memory keys (dev/test only)",
      );
    }
  }
  return cached;
}

/** Test helper: replace issuer keys (does not touch env). */
export function setIssuerKeysForTests(keys: KeyPairHex): void {
  cached = { ...keys, ephemeral: false };
}

export function resetIssuerKeysForTests(): void {
  cached = undefined;
}
