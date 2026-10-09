/**
 * Shared protocol-v1 conformance — same vectors as crates/agentkey-core.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  canonicalIssueMessage,
  canonicalVerifyMessage,
} from "@agentkey/protocol";
import {
  signMessage,
  verifyProof,
  verifySignature,
  type ResolvedAgentForVerify,
} from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  here,
  "../../../fixtures/protocol-v1/conformance.json",
);

interface FixtureFile {
  wireVersion: string;
  keys: {
    subject: { privateKey: string; publicKey: string };
    issuer: { privateKey: string; publicKey: string };
  };
  canonical: { verifyMessage: string; issueMessage: string };
  agent: {
    id: string;
    publicHandle: string;
    privateSubject: string;
    publicKey: string;
    status: "active" | "revoked";
    issuerAttestation: string;
  };
  cases: Array<{
    name: string;
    request: { agentId: string; proof: string };
    unresolved?: boolean;
    resolveOverride?: { status?: "active" | "revoked" };
    omitIssuerPublicKey?: boolean;
    expected: { status: string; reasonIncludes?: string };
  }>;
  signatures: { ownership: string; issuerAttestation: string };
}

function load(): FixtureFile {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as FixtureFile;
}

describe("protocol-v1 conformance fixtures", () => {
  const f = load();

  it("declares agentkey-v1 wire version", () => {
    assert.equal(f.wireVersion, "agentkey-v1");
  });

  it("canonical messages match TS helpers", () => {
    assert.equal(
      canonicalVerifyMessage(f.agent.id, "chal-conformance-v1"),
      f.canonical.verifyMessage,
    );
    assert.equal(
      canonicalIssueMessage({
        id: f.agent.id,
        publicHandle: f.agent.publicHandle,
        privateSubject: f.agent.privateSubject,
        publicKey: f.agent.publicKey,
      }),
      f.canonical.issueMessage,
    );
  });

  it("signatures verify and re-sign matches fixture", () => {
    assert.equal(
      verifySignature(
        f.canonical.verifyMessage,
        f.signatures.ownership,
        f.keys.subject.publicKey,
      ),
      true,
    );
    assert.equal(
      verifySignature(
        f.canonical.issueMessage,
        f.signatures.issuerAttestation,
        f.keys.issuer.publicKey,
      ),
      true,
    );
    assert.equal(
      signMessage(f.canonical.verifyMessage, f.keys.subject.privateKey),
      f.signatures.ownership,
    );
  });

  for (const c of load().cases) {
    it(`case: ${c.name}`, () => {
      let resolved: ResolvedAgentForVerify | undefined;
      if (!c.unresolved) {
        resolved = {
          publicKey: f.agent.publicKey,
          status: c.resolveOverride?.status ?? f.agent.status,
          publicHandle: f.agent.publicHandle,
          privateSubject: f.agent.privateSubject,
          issuerAttestation: f.agent.issuerAttestation,
        };
      }
      const result = verifyProof(
        { agentId: c.request.agentId, proof: c.request.proof },
        resolved,
        c.omitIssuerPublicKey
          ? {}
          : { issuerPublicKey: f.keys.issuer.publicKey },
      );
      assert.equal(result.status, c.expected.status);
      if (c.expected.reasonIncludes) {
        assert.match(
          result.reason ?? "",
          new RegExp(c.expected.reasonIncludes, "i"),
        );
      }
    });
  }
});
