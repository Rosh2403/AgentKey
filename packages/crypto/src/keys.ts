import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

/** Fixed SPKI DER prefix for a 32-byte Ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
/** Fixed PKCS8 DER prefix for a 32-byte Ed25519 private seed. */
const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

export interface KeyPairHex {
  publicKey: string;
  privateKey: string;
}

function isHex(value: string, byteLength: number): boolean {
  return (
    value.length === byteLength * 2 && /^[0-9a-fA-F]+$/.test(value)
  );
}

export function isValidPublicKeyHex(publicKey: string): boolean {
  return isHex(publicKey, 32);
}

export function isValidPrivateKeyHex(privateKey: string): boolean {
  return isHex(privateKey, 32);
}

export function publicKeyFromHex(publicKeyHex: string): KeyObject {
  if (!isValidPublicKeyHex(publicKeyHex)) {
    throw new Error("invalid Ed25519 public key encoding");
  }
  const raw = Buffer.from(publicKeyHex, "hex");
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

export function privateKeyFromHex(privateKeyHex: string): KeyObject {
  if (!isValidPrivateKeyHex(privateKeyHex)) {
    throw new Error("invalid Ed25519 private key encoding");
  }
  const raw = Buffer.from(privateKeyHex, "hex");
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, raw]),
    format: "der",
    type: "pkcs8",
  });
}

function rawPublicKeyHex(key: KeyObject): string {
  const der = key.export({ type: "spki", format: "der" });
  return Buffer.from(der.subarray(-32)).toString("hex");
}

function rawPrivateKeyHex(key: KeyObject): string {
  const der = key.export({ type: "pkcs8", format: "der" });
  return Buffer.from(der.subarray(-32)).toString("hex");
}

/** Generate a fresh Ed25519 key pair; keys are hex-encoded raw 32-byte values. */
export function generateKeyPair(): KeyPairHex {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: rawPublicKeyHex(publicKey),
    privateKey: rawPrivateKeyHex(privateKey),
  };
}

export function signMessage(
  message: string | Uint8Array,
  privateKeyHex: string,
): string {
  const key = privateKeyFromHex(privateKeyHex);
  const data = typeof message === "string" ? Buffer.from(message, "utf8") : message;
  return Buffer.from(sign(null, data, key)).toString("hex");
}

export function verifySignature(
  message: string | Uint8Array,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  if (!isHex(signatureHex, 64)) {
    return false;
  }
  try {
    const key = publicKeyFromHex(publicKeyHex);
    const data =
      typeof message === "string" ? Buffer.from(message, "utf8") : message;
    return verify(null, data, key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}
