import {
  canonicalVerifyMessage,
  encodeOwnershipProof,
} from "@agentkey/protocol";

/** Same PKCS8 DER prefix as @agentkey/crypto (32-byte Ed25519 seed). */
const ED25519_PKCS8_PREFIX = hexToBytes("302e020100300506032b657004220420");

export interface BrowserKeyPair {
  publicKey: string;
  privateKey: string;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("invalid hex");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isHex(value: string, byteLength: number): boolean {
  return value.length === byteLength * 2 && /^[0-9a-fA-F]+$/.test(value);
}

/**
 * Generate a subject Ed25519 key pair (raw 32-byte hex), matching API/crypto wire format.
 * Uses Web Crypto — browser only; not a substitute for the Node crypto package.
 */
export async function generateKeyPair(): Promise<BrowserKeyPair> {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]);
  const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  if (rawPub.byteLength !== 32 || pkcs8.byteLength < 32) {
    throw new Error("unexpected Ed25519 key export shape");
  }
  const seed = pkcs8.subarray(pkcs8.byteLength - 32);
  return {
    publicKey: bytesToHex(rawPub),
    privateKey: bytesToHex(seed),
  };
}

async function importPrivateKey(privateKeyHex: string): Promise<CryptoKey> {
  if (!isHex(privateKeyHex, 32)) {
    throw new Error("privateKey must be a 32-byte Ed25519 seed (hex)");
  }
  const der = new Uint8Array(ED25519_PKCS8_PREFIX.length + 32);
  der.set(ED25519_PKCS8_PREFIX, 0);
  der.set(hexToBytes(privateKeyHex), ED25519_PKCS8_PREFIX.length);
  return crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, false, [
    "sign",
  ]);
}

/** Create a JSON ownership proof signed in-browser (local / non-production flows). */
export async function createOwnershipProof(input: {
  agentId: string;
  challenge: string;
  privateKey: string;
}): Promise<string> {
  if (!input.agentId?.trim()) {
    throw new Error("agentId is required");
  }
  if (!input.challenge?.trim()) {
    throw new Error("challenge is required");
  }
  const message = canonicalVerifyMessage(input.agentId, input.challenge);
  const key = await importPrivateKey(input.privateKey);
  const data = new TextEncoder().encode(message);
  const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", key, data));
  return encodeOwnershipProof({
    challenge: input.challenge,
    signature: bytesToHex(signature),
  });
}

export function randomChallenge(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `chal_${bytesToHex(bytes)}`;
}
