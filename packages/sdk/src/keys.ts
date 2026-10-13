/**
 * Minimal Ed25519 helpers for builder demos (generate + ownership proof).
 * Uses Node's crypto so the SDK stays dependency-free for git installs.
 */
import {
  createPrivateKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";
import {
  canonicalVerifyMessage,
  encodeOwnershipProof,
} from "./wire.js";

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
  return value.length === byteLength * 2 && /^[0-9a-fA-F]+$/.test(value);
}

function isValidPrivateKeyHex(privateKey: string): boolean {
  return isHex(privateKey, 32);
}

function privateKeyFromHex(privateKeyHex: string): KeyObject {
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

function signMessage(message: string, privateKeyHex: string): string {
  const key = privateKeyFromHex(privateKeyHex);
  return Buffer.from(sign(null, Buffer.from(message, "utf8"), key)).toString(
    "hex",
  );
}

/** Generate a fresh Ed25519 key pair; keys are hex-encoded raw 32-byte values. */
export function generateKeyPair(): KeyPairHex {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: rawPublicKeyHex(publicKey),
    privateKey: rawPrivateKeyHex(privateKey),
  };
}

/** Create a JSON ownership proof signed by the subject private key. */
export function createOwnershipProof(input: {
  agentId: string;
  challenge: string;
  privateKey: string;
}): string {
  if (!input.agentId?.trim()) {
    throw new Error("agentId is required");
  }
  if (!input.challenge?.trim()) {
    throw new Error("challenge is required");
  }
  const message = canonicalVerifyMessage(input.agentId, input.challenge);
  const signature = signMessage(message, input.privateKey);
  return encodeOwnershipProof({
    challenge: input.challenge,
    signature,
  });
}
