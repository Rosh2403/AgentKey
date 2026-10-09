//! Optional thin CLI: verify an ownership proof JSON against agent fields.
//!
//! Build: `cargo build -p agentkey-core --features cli --bin agentkey-verify`
//!
//! Usage (stdin JSON):
//! ```json
//! {
//!   "agentId": "...",
//!   "proof": "{\"challenge\":\"...\",\"signature\":\"...\"}",
//!   "resolved": {
//!     "publicKey": "...",
//!     "status": "active",
//!     "publicHandle": "...",
//!     "privateSubject": "...",
//!     "issuerAttestation": "..."
//!   },
//!   "issuerPublicKey": "..."
//! }
//! ```
//!
//! Prints a single-line JSON `VerifyResult` and exits 0 when `valid`, 1 otherwise.

use agentkey_core::{
    verify_proof, AgentStatus, ResolvedAgentForVerify, VerifyProofOptions, VerifyRequest,
    VerifyStatus,
};
use serde::Deserialize;
use std::io::{self, Read};
use std::process::ExitCode;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliInput {
    agent_id: String,
    proof: String,
    resolved: Option<CliResolved>,
    issuer_public_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliResolved {
    public_key: String,
    status: CliAgentStatus,
    public_handle: String,
    private_subject: String,
    issuer_attestation: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum CliAgentStatus {
    Active,
    Revoked,
}

fn main() -> ExitCode {
    let mut buf = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut buf) {
        eprintln!("failed to read stdin: {e}");
        return ExitCode::FAILURE;
    }

    let input: CliInput = match serde_json::from_str(&buf) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("invalid input JSON: {e}");
            return ExitCode::FAILURE;
        }
    };

    let resolved = input.resolved.map(|r| ResolvedAgentForVerify {
        public_key: r.public_key,
        status: match r.status {
            CliAgentStatus::Active => AgentStatus::Active,
            CliAgentStatus::Revoked => AgentStatus::Revoked,
        },
        public_handle: r.public_handle,
        private_subject: r.private_subject,
        issuer_attestation: r.issuer_attestation,
    });

    let options = VerifyProofOptions {
        issuer_public_key: input.issuer_public_key,
    };

    let result = verify_proof(
        &VerifyRequest {
            agent_id: input.agent_id,
            proof: input.proof,
        },
        resolved.as_ref(),
        &options,
    );

    match serde_json::to_string(&result) {
        Ok(json) => println!("{json}"),
        Err(e) => {
            eprintln!("serialize failed: {e}");
            return ExitCode::FAILURE;
        }
    }

    if result.status == VerifyStatus::Valid {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
