//! Shared protocol-v1 conformance: same vectors as TS (`fixtures/protocol-v1/`).

use agentkey_core::{
    canonical_issue_message, canonical_verify_message, is_valid_public_key_hex, sign_message,
    verify_proof, verify_signature, AgentStatus, IssueBinding, ResolvedAgentForVerify,
    VerifyProofOptions, VerifyRequest, VerifyStatus, WIRE_VERSION,
};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

fn fixtures_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/protocol-v1/conformance.json")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureFile {
    wire_version: String,
    keys: Keys,
    canonical: Canonical,
    agent: Agent,
    cases: Vec<Case>,
    signatures: Signatures,
}

#[derive(Debug, Deserialize)]
struct Keys {
    subject: KeyPair,
    issuer: KeyPair,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeyPair {
    private_key: String,
    public_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Canonical {
    verify_message: String,
    issue_message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Agent {
    id: String,
    public_handle: String,
    private_subject: String,
    public_key: String,
    status: String,
    issuer_attestation: String,
}

#[derive(Debug, Deserialize)]
struct Signatures {
    ownership: String,
    #[serde(rename = "issuerAttestation")]
    issuer_attestation: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    name: String,
    request: CaseRequest,
    #[serde(default)]
    unresolved: bool,
    #[serde(default)]
    resolve_override: Option<ResolveOverride>,
    #[serde(default)]
    omit_issuer_public_key: bool,
    expected: Expected,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaseRequest {
    agent_id: String,
    proof: String,
}

#[derive(Debug, Deserialize)]
struct ResolveOverride {
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expected {
    status: String,
    reason_includes: Option<String>,
}

fn load() -> FixtureFile {
    let raw = fs::read_to_string(fixtures_path()).expect("read conformance.json");
    serde_json::from_str(&raw).expect("parse conformance.json")
}

fn status_from_str(s: &str) -> VerifyStatus {
    match s {
        "valid" => VerifyStatus::Valid,
        "invalid" => VerifyStatus::Invalid,
        "unknown" => VerifyStatus::Unknown,
        "revoked" => VerifyStatus::Revoked,
        "error" => VerifyStatus::Error,
        other => panic!("unknown status {other}"),
    }
}

fn agent_status(s: &str) -> AgentStatus {
    match s {
        "active" => AgentStatus::Active,
        "revoked" => AgentStatus::Revoked,
        other => panic!("unknown agent status {other}"),
    }
}

#[test]
fn wire_version_tag() {
    let f = load();
    assert_eq!(f.wire_version, WIRE_VERSION);
    assert_eq!(WIRE_VERSION, "agentkey-v1");
}

#[test]
fn canonical_messages_match_fixture() {
    let f = load();
    let verify = canonical_verify_message(&f.agent.id, "chal-conformance-v1");
    assert_eq!(verify, f.canonical.verify_message);

    let issue = canonical_issue_message(&IssueBinding {
        id: &f.agent.id,
        public_handle: &f.agent.public_handle,
        private_subject: &f.agent.private_subject,
        public_key: &f.agent.public_key,
    });
    assert_eq!(issue, f.canonical.issue_message);
}

#[test]
fn keys_and_signatures_agree_with_ts() {
    let f = load();
    assert!(is_valid_public_key_hex(&f.keys.subject.public_key));
    assert!(is_valid_public_key_hex(&f.keys.issuer.public_key));

    // Derive public from seed must match fixture (dalek == Node crypto).
    let derived = {
        use ed25519_dalek::SigningKey;
        let seed: [u8; 32] = hex::decode(&f.keys.subject.private_key)
            .unwrap()
            .try_into()
            .unwrap();
        hex::encode(SigningKey::from_bytes(&seed).verifying_key().to_bytes())
    };
    assert_eq!(derived, f.keys.subject.public_key);

    assert!(verify_signature(
        &f.canonical.verify_message,
        &f.signatures.ownership,
        &f.keys.subject.public_key,
    ));
    assert!(verify_signature(
        &f.canonical.issue_message,
        &f.signatures.issuer_attestation,
        &f.keys.issuer.public_key,
    ));

    // Rust re-sign must reproduce TS signature bytes.
    let resign = sign_message(
        &f.canonical.verify_message,
        &f.keys.subject.private_key,
    )
    .unwrap();
    assert_eq!(resign, f.signatures.ownership);
}

#[test]
fn verify_cases_match_fixture_expectations() {
    let f = load();

    for case in &f.cases {
        let resolved = if case.unresolved {
            None
        } else {
            let mut status = agent_status(&f.agent.status);
            if let Some(over) = &case.resolve_override {
                if let Some(s) = &over.status {
                    status = agent_status(s);
                }
            }
            Some(ResolvedAgentForVerify {
                public_key: f.agent.public_key.clone(),
                status,
                public_handle: f.agent.public_handle.clone(),
                private_subject: f.agent.private_subject.clone(),
                issuer_attestation: Some(f.agent.issuer_attestation.clone()),
            })
        };

        let options = VerifyProofOptions {
            issuer_public_key: if case.omit_issuer_public_key {
                None
            } else {
                Some(f.keys.issuer.public_key.clone())
            },
        };

        let result = verify_proof(
            &VerifyRequest {
                agent_id: case.request.agent_id.clone(),
                proof: case.request.proof.clone(),
            },
            resolved.as_ref(),
            &options,
        );

        assert_eq!(
            result.status,
            status_from_str(&case.expected.status),
            "case {}",
            case.name
        );
        if let Some(needle) = &case.expected.reason_includes {
            let reason = result.reason.as_deref().unwrap_or("");
            assert!(
                reason.to_lowercase().contains(&needle.to_lowercase()),
                "case {}: reason {reason:?} missing {needle}",
                case.name
            );
        }
    }
}
