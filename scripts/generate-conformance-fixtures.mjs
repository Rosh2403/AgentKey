/**
 * Generate deterministic protocol-v1 conformance fixtures from the TS crypto path.
 * Seeds are test-only vectors, not secrets.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createPrivateKey, createPublicKey } from "node:crypto";
import {
  createIssuerAttestation,
  createOwnershipProof,
  signMessage,
  verifySignature,
} from "../packages/crypto/dist/index.js";
import {
  canonicalVerifyMessage,
  canonicalIssueMessage,
} from "../packages/protocol/dist/index.js";

const SUBJECT_SEED = "01".repeat(32);
const ISSUER_SEED = "02".repeat(32);
const OTHER_SEED = "03".repeat(32);

const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

function keyPairFromSeed(seedHex) {
  const raw = Buffer.from(seedHex, "hex");
  const privateKeyObj = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, raw]),
    format: "der",
    type: "pkcs8",
  });
  const pub = createPublicKey(privateKeyObj);
  const der = pub.export({ type: "spki", format: "der" });
  const publicKeyHex = Buffer.from(der.subarray(-32)).toString("hex");
  return { privateKey: seedHex, publicKey: publicKeyHex };
}

const subject = keyPairFromSeed(SUBJECT_SEED);
const issuer = keyPairFromSeed(ISSUER_SEED);
const other = keyPairFromSeed(OTHER_SEED);

const agentId = "ak_conformance_001";
const publicHandle = "conformance-bot";
const privateSubject = "subj_conformance_001";
const challenge = "chal-conformance-v1";

const verifyMsg = canonicalVerifyMessage(agentId, challenge);
const issueMsg = canonicalIssueMessage({
  id: agentId,
  publicHandle,
  privateSubject,
  publicKey: subject.publicKey,
});

const ownershipSig = signMessage(verifyMsg, subject.privateKey);
const issuerAttestation = createIssuerAttestation({
  id: agentId,
  publicHandle,
  privateSubject,
  publicKey: subject.publicKey,
  issuerPrivateKey: issuer.privateKey,
});
const proof = createOwnershipProof({
  agentId,
  challenge,
  privateKey: subject.privateKey,
});
const wrongProof = createOwnershipProof({
  agentId,
  challenge,
  privateKey: other.privateKey,
});

if (!verifySignature(verifyMsg, ownershipSig, subject.publicKey)) {
  throw new Error("ownership signature self-check failed");
}
if (!verifySignature(issueMsg, issuerAttestation, issuer.publicKey)) {
  throw new Error("issuer attestation self-check failed");
}

const fixtures = {
  wireVersion: "agentkey-v1",
  description:
    "Deterministic Agentkey protocol-v1 conformance vectors. Seeds are test-only (not secrets).",
  keys: {
    subject: {
      privateKey: subject.privateKey,
      publicKey: subject.publicKey,
      note: "seed = 0x01 repeated 32 bytes",
    },
    issuer: {
      privateKey: issuer.privateKey,
      publicKey: issuer.publicKey,
      note: "seed = 0x02 repeated 32 bytes",
    },
    other: {
      privateKey: other.privateKey,
      publicKey: other.publicKey,
      note: "seed = 0x03 repeated 32 bytes (wrong signer)",
    },
  },
  canonical: {
    verifyMessage: verifyMsg,
    issueMessage: issueMsg,
  },
  agent: {
    id: agentId,
    publicHandle,
    privateSubject,
    publicKey: subject.publicKey,
    status: "active",
    issuerAttestation,
  },
  cases: [
    {
      name: "valid_ownership_with_attestation",
      request: { agentId, proof },
      expected: { status: "valid" },
    },
    {
      name: "invalid_wrong_signer",
      request: { agentId, proof: wrongProof },
      expected: { status: "invalid", reasonIncludes: "signature" },
    },
    {
      name: "unknown_missing_agent",
      request: { agentId: "ak_missing", proof },
      unresolved: true,
      expected: { status: "unknown" },
    },
    {
      name: "revoked_agent",
      request: { agentId, proof },
      resolveOverride: { status: "revoked" },
      expected: { status: "revoked" },
    },
    {
      name: "error_missing_proof",
      request: { agentId, proof: "" },
      expected: { status: "error" },
    },
    {
      name: "error_malformed_proof",
      request: { agentId, proof: "not-json" },
      expected: { status: "error", reasonIncludes: "JSON" },
    },
    {
      name: "error_attestation_without_issuer_key",
      request: { agentId, proof },
      omitIssuerPublicKey: true,
      expected: { status: "error", reasonIncludes: "issuer" },
    },
  ],
  signatures: {
    ownership: ownershipSig,
    issuerAttestation,
  },
};

mkdirSync("fixtures/protocol-v1", { recursive: true });
writeFileSync(
  "fixtures/protocol-v1/conformance.json",
  JSON.stringify(fixtures, null, 2) + "\n",
);
console.log("wrote fixtures/protocol-v1/conformance.json");
console.log("subject pub:", subject.publicKey);
console.log("issuer pub:", issuer.publicKey);
