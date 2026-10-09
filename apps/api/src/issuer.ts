import {
  issuerKeySourcesFromEnv,
  loadIssuerKeyPair,
  type KeyPairHex,
} from "@agentkey/crypto";

let cached: (KeyPairHex & { ephemeral: boolean }) | undefined;

/** Single root issuer key material for this process. */
export function getIssuerKeys(): KeyPairHex & { ephemeral: boolean } {
  if (!cached) {
    cached = loadIssuerKeyPair(issuerKeySourcesFromEnv());
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
