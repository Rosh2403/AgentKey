//! Canonical encoding — must byte-match `@agentkey/protocol`.

/// Overall wire / protocol version tag shared with TS fixtures (`agentkey-v1`).
///
/// Canonical *message* prefixes are versioned separately (`agentkey-verify-v1`,
/// `agentkey-issue-v1`). Bump those prefixes (and this tag) together when the
/// signed payload shape changes.
pub const WIRE_VERSION: &str = "agentkey-v1";

/// Single root issuer id (locked decision A).
pub const ROOT_ISSUER_ID: &str = "agentkey:root";

/// Canonical message signed by the subject for ownership verify.
///
/// Format (UTF-8, LF separators):
/// ```text
/// agentkey-verify-v1
/// {agentId}
/// {challenge}
/// ```
pub fn canonical_verify_message(agent_id: &str, challenge: &str) -> String {
    format!("agentkey-verify-v1\n{agent_id}\n{challenge}")
}

/// Inputs for the root issuer attestation binding.
pub struct IssueBinding<'a> {
    /// Stable agent id.
    pub id: &'a str,
    /// Public handle.
    pub public_handle: &'a str,
    /// Private subject.
    pub private_subject: &'a str,
    /// Subject Ed25519 public key (32-byte hex).
    pub public_key: &'a str,
}

/// Canonical message signed by the root issuer at issue time.
///
/// Format (UTF-8, LF separators):
/// ```text
/// agentkey-issue-v1
/// {id}
/// {publicHandle}
/// {privateSubject}
/// {publicKey}
/// ```
pub fn canonical_issue_message(input: &IssueBinding<'_>) -> String {
    [
        "agentkey-issue-v1",
        input.id,
        input.public_handle,
        input.private_subject,
        input.public_key,
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_message_matches_ts_shape() {
        let msg = canonical_verify_message("ak_1", "chal");
        assert_eq!(msg, "agentkey-verify-v1\nak_1\nchal");
    }

    #[test]
    fn issue_message_matches_ts_shape() {
        let msg = canonical_issue_message(&IssueBinding {
            id: "ak_1",
            public_handle: "bot",
            private_subject: "subj",
            public_key: &"aa".repeat(32),
        });
        assert_eq!(
            msg,
            format!(
                "agentkey-issue-v1\nak_1\nbot\nsubj\n{}",
                "aa".repeat(32)
            )
        );
    }
}
