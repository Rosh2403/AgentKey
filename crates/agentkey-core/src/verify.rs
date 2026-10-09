//! Typed verify — parallel of `verifyProof` in `@agentkey/crypto`.
//!
//! Outcomes match the TS `VerifyStatus` enum:
//! `valid` | `invalid` | `unknown` | `revoked` | `error`.
//! Always fail closed on parse/crypto/config errors (`error`).

use crate::canonical::{canonical_issue_message, canonical_verify_message, IssueBinding};
use crate::keys::{is_valid_public_key_hex, verify_signature};
use crate::proof::parse_ownership_proof;
use serde::{Deserialize, Serialize};

/// Typed verify answers — machine-checkable; never free-text status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerifyStatus {
    /// Ownership proof verified.
    Valid,
    /// Cryptographically invalid signature (agent known, not revoked).
    Invalid,
    /// Agent could not be resolved.
    Unknown,
    /// Agent record is revoked.
    Revoked,
    /// Fail-closed: parse/crypto/config/unexpected failure.
    Error,
}

impl VerifyStatus {
    /// Wire string matching TS (`"valid"`, …).
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Valid => "valid",
            Self::Invalid => "invalid",
            Self::Unknown => "unknown",
            Self::Revoked => "revoked",
            Self::Error => "error",
        }
    }
}

/// Structured verify result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifyResult {
    /// Typed status.
    pub status: VerifyStatus,
    /// Human-readable reason for non-valid outcomes; omit/`None` when valid.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Lifecycle status for an issued agent identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    /// Agent may present ownership proofs.
    Active,
    /// Agent is revoked; verify returns `revoked`.
    Revoked,
}

/// Verify request (agent id + JSON ownership proof).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRequest {
    /// Agent id being verified.
    pub agent_id: String,
    /// JSON-encoded ownership proof.
    pub proof: String,
}

/// Resolved agent fields needed for verify (from issuer store / resolve).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedAgentForVerify {
    /// Subject Ed25519 public key (32-byte hex).
    pub public_key: String,
    /// Lifecycle status.
    pub status: AgentStatus,
    /// Public handle (bound in issuer attestation).
    pub public_handle: String,
    /// Full private subject from the issuer store.
    pub private_subject: String,
    /// Hex issuer attestation over the issue binding, when present.
    pub issuer_attestation: Option<String>,
}

/// Optional verify knobs.
#[derive(Debug, Clone, Default)]
pub struct VerifyProofOptions {
    /// Root issuer public key (hex). Required when checking issuer attestation.
    pub issuer_public_key: Option<String>,
}

/// Fail-closed helper: any unexpected condition becomes `error`.
pub fn fail_closed(reason: impl Into<String>) -> VerifyResult {
    VerifyResult {
        status: VerifyStatus::Error,
        reason: Some(reason.into()),
    }
}

/// Verify an ownership proof against a resolved agent record.
///
/// Fail-closed on parse/crypto errors. Typed statuses otherwise.
pub fn verify_proof(
    request: &VerifyRequest,
    resolved: Option<&ResolvedAgentForVerify>,
    options: &VerifyProofOptions,
) -> VerifyResult {
    // Catch panics? TS uses try/catch. We avoid panics; map Result errors instead.
    verify_proof_inner(request, resolved, options)
}

fn verify_proof_inner(
    request: &VerifyRequest,
    resolved: Option<&ResolvedAgentForVerify>,
    options: &VerifyProofOptions,
) -> VerifyResult {
    if request.agent_id.trim().is_empty() {
        return fail_closed("missing agentId");
    }
    if request.proof.trim().is_empty() {
        return fail_closed("missing proof");
    }

    let parsed = match parse_ownership_proof(&request.proof) {
        Ok(p) => p,
        Err(e) => return fail_closed(e.to_string()),
    };

    let Some(resolved) = resolved else {
        return VerifyResult {
            status: VerifyStatus::Unknown,
            reason: Some("agent not found".into()),
        };
    };

    if resolved.status == AgentStatus::Revoked {
        return VerifyResult {
            status: VerifyStatus::Revoked,
            reason: Some("agent revoked".into()),
        };
    }

    if !is_valid_public_key_hex(&resolved.public_key) {
        return fail_closed("resolved agent has invalid public key");
    }

    if let Some(attestation) = resolved.issuer_attestation.as_deref() {
        let Some(issuer_pk) = options.issuer_public_key.as_deref() else {
            return fail_closed("issuer public key not configured");
        };
        let issue_msg = canonical_issue_message(&IssueBinding {
            id: &request.agent_id,
            public_handle: &resolved.public_handle,
            private_subject: &resolved.private_subject,
            public_key: &resolved.public_key,
        });
        if !verify_signature(&issue_msg, attestation, issuer_pk) {
            return fail_closed("issuer attestation invalid");
        }
    }

    let message = canonical_verify_message(&request.agent_id, &parsed.challenge);
    if !verify_signature(&message, &parsed.signature, &resolved.public_key) {
        return VerifyResult {
            status: VerifyStatus::Invalid,
            reason: Some("signature verification failed".into()),
        };
    }

    VerifyResult {
        status: VerifyStatus::Valid,
        reason: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::sign_message;
    use crate::proof::{encode_ownership_proof, OwnershipProof};

    fn make_proof(agent_id: &str, challenge: &str, sk: &str) -> String {
        let msg = canonical_verify_message(agent_id, challenge);
        let signature = sign_message(&msg, sk).unwrap();
        encode_ownership_proof(&OwnershipProof {
            challenge: challenge.into(),
            signature,
        })
    }

    #[test]
    fn fails_closed_when_proof_missing() {
        let r = verify_proof(
            &VerifyRequest {
                agent_id: "ak_1".into(),
                proof: "".into(),
            },
            None,
            &VerifyProofOptions::default(),
        );
        assert_eq!(r.status, VerifyStatus::Error);
    }

    #[test]
    fn returns_unknown_when_unresolved() {
        let sk = "01".repeat(32);
        let proof = make_proof("ak_missing", "c", &sk);
        let r = verify_proof(
            &VerifyRequest {
                agent_id: "ak_missing".into(),
                proof,
            },
            None,
            &VerifyProofOptions::default(),
        );
        assert_eq!(r.status, VerifyStatus::Unknown);
    }
}
