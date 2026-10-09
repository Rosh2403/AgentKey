#!/usr/bin/env node
/**
 * Generate root issuer Ed25519 keys. Prints hex to stdout or writes files.
 * Never commit the private key. Example:
 *   pnpm issuer:generate
 *   pnpm issuer:generate -- --out-dir .secrets
 */
import { generateIssuerKeyPair } from "../packages/crypto/src/issuer-keys.js";

function parseArgs(argv: string[]): { outDir?: string } {
  const outIdx = argv.indexOf("--out-dir");
  if (outIdx >= 0 && argv[outIdx + 1]) {
    return { outDir: argv[outIdx + 1] };
  }
  return {};
}

const { outDir } = parseArgs(process.argv.slice(2));

if (outDir) {
  const privateKeyPath = `${outDir.replace(/\/$/, "")}/issuer.priv`;
  const publicKeyPath = `${outDir.replace(/\/$/, "")}/issuer.pub`;
  const keys = generateIssuerKeyPair({ privateKeyPath, publicKeyPath });
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        written: { privateKeyPath, publicKeyPath },
        publicKey: keys.publicKey,
        hint: "Set AGENTKEY_ISSUER_PRIVATE_KEY_FILE / AGENTKEY_ISSUER_PUBLIC_KEY_FILE; never commit private key",
      },
      null,
      2,
    ),
  );
} else {
  const keys = generateIssuerKeyPair();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        AGENTKEY_ISSUER_PRIVATE_KEY: keys.privateKey,
        AGENTKEY_ISSUER_PUBLIC_KEY: keys.publicKey,
        hint: "Paste into .env locally; never commit",
      },
      null,
      2,
    ),
  );
}
