import {
  failClosed,
  type VerifyRequest,
  type VerifyResult,
} from "@agentkey/protocol";

/**
 * Thin crypto helpers for slice-0.
 * Full key management / issuer signing lands after wire format freeze.
 * Verify always fails closed on parse/crypto errors.
 */

export function verifyProof(request: VerifyRequest): VerifyResult {
  try {
    if (!request.agentId?.trim()) {
      return failClosed("missing agentId");
    }
    if (!request.proof?.trim()) {
      return failClosed("missing proof");
    }
    // Slice-0 stub: no real crypto yet — unknown until issuer keys + wire format land.
    return {
      status: "unknown",
      reason: "crypto verify stub: issuer attestation not configured",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "verify failed";
    return failClosed(message);
  }
}

/** Placeholder — real Ed25519 (or chosen curve) signing later. */
export function signStub(_message: Uint8Array, _privateKey: Uint8Array): never {
  throw new Error("signStub: not implemented in slice-0 scaffold");
}
