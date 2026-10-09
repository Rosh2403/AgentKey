import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  generateKeyPair,
  isValidPrivateKeyHex,
  isValidPublicKeyHex,
  signMessage,
  verifySignature,
  type KeyPairHex,
} from "./keys.js";

export interface IssuerKeySources {
  /** Hex private key from env. */
  privateKey?: string;
  /** Hex public key from env. */
  publicKey?: string;
  /** Path to a file containing the hex private key (trimmed). */
  privateKeyFile?: string;
  /** Path to a file containing the hex public key (trimmed). */
  publicKeyFile?: string;
}

function readKeyFile(path: string, label: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`${label} file not found: ${resolved}`);
  }
  const value = readFileSync(resolved, "utf8").trim();
  if (!value) {
    throw new Error(`${label} file is empty: ${resolved}`);
  }
  return value;
}

function resolveHexKey(
  inline: string | undefined,
  filePath: string | undefined,
  label: string,
): string {
  const fromEnv = inline?.trim() ?? "";
  if (fromEnv) return fromEnv;
  const path = filePath?.trim() ?? "";
  if (path) return readKeyFile(path, label);
  return "";
}

/**
 * Load the single root issuer key pair from env hex and/or key files.
 * Never logs key material. Generates ephemeral keys only when nothing is configured.
 */
export function loadIssuerKeyPair(
  sources: IssuerKeySources,
): KeyPairHex & { ephemeral: boolean } {
  const privateKey = resolveHexKey(
    sources.privateKey,
    sources.privateKeyFile,
    "issuer private key",
  );
  const publicKey = resolveHexKey(
    sources.publicKey,
    sources.publicKeyFile,
    "issuer public key",
  );

  if (privateKey || publicKey) {
    if (!isValidPrivateKeyHex(privateKey) || !isValidPublicKeyHex(publicKey)) {
      throw new Error(
        "issuer keys must be 32-byte hex (env AGENTKEY_ISSUER_*_KEY or *_KEY_FILE)",
      );
    }
    const probe = signMessage("agentkey-issuer-probe", privateKey);
    if (!verifySignature("agentkey-issuer-probe", probe, publicKey)) {
      throw new Error("issuer public/private key mismatch");
    }
    return { privateKey, publicKey, ephemeral: false };
  }

  const generated = generateKeyPair();
  return { ...generated, ephemeral: true };
}

/** Collect issuer key sources from process env (no secrets logged). */
export function issuerKeySourcesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): IssuerKeySources {
  const sources: IssuerKeySources = {};
  if (env.AGENTKEY_ISSUER_PRIVATE_KEY !== undefined) {
    sources.privateKey = env.AGENTKEY_ISSUER_PRIVATE_KEY;
  }
  if (env.AGENTKEY_ISSUER_PUBLIC_KEY !== undefined) {
    sources.publicKey = env.AGENTKEY_ISSUER_PUBLIC_KEY;
  }
  if (env.AGENTKEY_ISSUER_PRIVATE_KEY_FILE !== undefined) {
    sources.privateKeyFile = env.AGENTKEY_ISSUER_PRIVATE_KEY_FILE;
  }
  if (env.AGENTKEY_ISSUER_PUBLIC_KEY_FILE !== undefined) {
    sources.publicKeyFile = env.AGENTKEY_ISSUER_PUBLIC_KEY_FILE;
  }
  return sources;
}

/**
 * Generate a fresh issuer key pair and optionally write hex files.
 * Files are never under git by convention (see .gitignore *.key / .secrets/).
 */
export function generateIssuerKeyPair(options?: {
  privateKeyPath?: string;
  publicKeyPath?: string;
}): KeyPairHex {
  const keys = generateKeyPair();
  if (options?.privateKeyPath) {
    const path = resolve(options.privateKeyPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${keys.privateKey}\n`, { encoding: "utf8", mode: 0o600 });
  }
  if (options?.publicKeyPath) {
    const path = resolve(options.publicKeyPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${keys.publicKey}\n`, { encoding: "utf8", mode: 0o644 });
  }
  return keys;
}
