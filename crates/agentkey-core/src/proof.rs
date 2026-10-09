//! Ownership proof wire codec — parallel of `@agentkey/protocol` proof helpers.
//!
//! Wire format: JSON object `{"challenge":"...","signature":"..."}` (hex sig).

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Subject ownership proof (challenge + Ed25519 signature hex).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OwnershipProof {
    /// Challenge string bound into the canonical verify message.
    pub challenge: String,
    /// Hex-encoded Ed25519 signature over `canonical_verify_message`.
    pub signature: String,
}

/// Malformed proof parse outcome (callers must fail closed).
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ProofParseError {
    /// Empty / missing proof string.
    #[error("missing proof")]
    Missing,
    /// Proof is not valid JSON.
    #[error("proof is not valid JSON")]
    InvalidJson,
    /// Proof JSON is not an object.
    #[error("proof must be a JSON object")]
    NotObject,
    /// `challenge` missing or empty.
    #[error("proof.challenge must be a non-empty string")]
    BadChallenge,
    /// `signature` missing or empty.
    #[error("proof.signature must be a non-empty string")]
    BadSignature,
}

/// Encode an ownership proof to the wire JSON string.
pub fn encode_ownership_proof(proof: &OwnershipProof) -> String {
    // Match TS `JSON.stringify({ challenge, signature })` key order.
    format!(
        "{{\"challenge\":{},\"signature\":{}}}",
        serde_json::to_string(&proof.challenge).expect("string"),
        serde_json::to_string(&proof.signature).expect("string"),
    )
}

/// Parse ownership proof from the wire string.
pub fn parse_ownership_proof(proof: &str) -> Result<OwnershipProof, ProofParseError> {
    if proof.trim().is_empty() {
        return Err(ProofParseError::Missing);
    }
    let value: serde_json::Value =
        serde_json::from_str(proof).map_err(|_| ProofParseError::InvalidJson)?;
    let obj = value.as_object().ok_or(ProofParseError::NotObject)?;

    let challenge = obj
        .get("challenge")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or(ProofParseError::BadChallenge)?;
    let signature = obj
        .get("signature")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or(ProofParseError::BadSignature)?;

    Ok(OwnershipProof {
        challenge: challenge.to_string(),
        signature: signature.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        let proof = OwnershipProof {
            challenge: "c1".into(),
            signature: "ab".repeat(64),
        };
        let encoded = encode_ownership_proof(&proof);
        let parsed = parse_ownership_proof(&encoded).unwrap();
        assert_eq!(parsed, proof);
    }

    #[test]
    fn rejects_non_json() {
        assert_eq!(
            parse_ownership_proof("not-json"),
            Err(ProofParseError::InvalidJson)
        );
    }
}
