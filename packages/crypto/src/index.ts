import {
  canonicalIssueMessage,
  canonicalVerifyMessage,
  encodeOwnershipProof,
  failClosed,
  parseOwnershipProof,
  type AgentStatus,
  type VerifyRequest,
  type VerifyResult,
} from "@agentkey/protocol";
import {
  generateKeyPair,
  isValidPrivateKeyHex,
  isValidPublicKeyHex,
  signMessage,
  verifySignature,
  type KeyPairHex,
} from "./keys.js";

export {
  generateKeyPair,
  isValidPrivateKeyHex,
  isValidPublicKeyHex,
  signMessage,
  verifySignature,
  type KeyPairHex,
};

export interface ResolvedAgentForVerify {
  publicKey: string;
  status: AgentStatus;
  publicHandle: string;
  /** Full private subject from the issuer store (not exposed on public resolve). */
  privateSubject: string;
  /** Hex issuer attestation over the issue binding, when present. */
  issuerAttestation?: string;
}

export interface VerifyProofOptions {
  /** Root issuer public key (hex). Required when checking issuer attestation. */
  issuerPublicKey?: string;
}

/**
 * Verify an ownership proof against a resolved agent record.
 * Fail-closed on parse/crypto errors. Typed statuses otherwise.
 */
export function verifyProof(
  request: VerifyRequest,
  resolved?: ResolvedAgentForVerify,
  options: VerifyProofOptions = {},
): VerifyResult {
  try {
    if (!request.agentId?.trim()) {
      return failClosed("missing agentId");
    }
    if (!request.proof?.trim()) {
      return failClosed("missing proof");
    }

    const parsed = parseOwnershipProof(request.proof);
    if ("error" in parsed) {
      return failClosed(parsed.error);
    }

    if (!resolved) {
      return { status: "unknown", reason: "agent not found" };
    }

    if (resolved.status === "revoked") {
      return { status: "revoked", reason: "agent revoked" };
    }

    if (!isValidPublicKeyHex(resolved.publicKey)) {
      return failClosed("resolved agent has invalid public key");
    }

    if (resolved.issuerAttestation) {
      if (!options.issuerPublicKey) {
        return failClosed("issuer public key not configured");
      }
      const issueMsg = canonicalIssueMessage({
        id: request.agentId,
        publicHandle: resolved.publicHandle,
        privateSubject: resolved.privateSubject,
        publicKey: resolved.publicKey,
      });
      if (
        !verifySignature(
          issueMsg,
          resolved.issuerAttestation,
          options.issuerPublicKey,
        )
      ) {
        return failClosed("issuer attestation invalid");
      }
    }

    const message = canonicalVerifyMessage(
      request.agentId,
      parsed.challenge,
    );
    const ok = verifySignature(
      message,
      parsed.signature,
      resolved.publicKey,
    );
    if (!ok) {
      return { status: "invalid", reason: "signature verification failed" };
    }
    return { status: "valid" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "verify failed";
    return failClosed(message);
  }
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

/** Root issuer attestation over the dual-ID binding. */
export function createIssuerAttestation(input: {
  id: string;
  publicHandle: string;
  privateSubject: string;
  publicKey: string;
  issuerPrivateKey: string;
}): string {
  const message = canonicalIssueMessage({
    id: input.id,
    publicHandle: input.publicHandle,
    privateSubject: input.privateSubject,
    publicKey: input.publicKey,
  });
  return signMessage(message, input.issuerPrivateKey);
}

/** Load or generate the single root issuer key pair for local/dev. */
export function loadIssuerKeyPair(env: {
  privateKey?: string;
  publicKey?: string;
}): KeyPairHex & { ephemeral: boolean } {
  const privateKey = env.privateKey?.trim() ?? "";
  const publicKey = env.publicKey?.trim() ?? "";

  if (privateKey || publicKey) {
    if (!isValidPrivateKeyHex(privateKey) || !isValidPublicKeyHex(publicKey)) {
      throw new Error(
        "AGENTKEY_ISSUER_PRIVATE_KEY / AGENTKEY_ISSUER_PUBLIC_KEY must be 32-byte hex",
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
