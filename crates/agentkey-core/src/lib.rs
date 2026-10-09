//! Agentkey protocol core (Rust).
//!
//! Parallel implementation of the TypeScript packages
//! `@agentkey/protocol` + `@agentkey/crypto` for never-forge / multi-lang use.
//!
//! **Wire format:** versioned as [`WIRE_VERSION`] (`agentkey-v1`). Canonical
//! message prefixes (`agentkey-verify-v1`, `agentkey-issue-v1`) must match TS.
//!
//! Product HTTP/MCP/SDK surfaces still call TypeScript until an intentional
//! FFI/WASM bridge is added. This crate is a second verify path, not a
//! replacement of the product API yet.

#![deny(missing_docs)]
#![forbid(unsafe_code)]

mod canonical;
mod keys;
mod proof;
mod verify;

pub use canonical::{
    canonical_issue_message, canonical_verify_message, IssueBinding, ROOT_ISSUER_ID,
    WIRE_VERSION,
};
pub use keys::{
    is_valid_private_key_hex, is_valid_public_key_hex, is_valid_signature_hex, sign_message,
    verify_signature, KeyError,
};
pub use proof::{
    encode_ownership_proof, parse_ownership_proof, OwnershipProof, ProofParseError,
};
pub use verify::{
    fail_closed, verify_proof, AgentStatus, ResolvedAgentForVerify, VerifyProofOptions,
    VerifyRequest, VerifyResult, VerifyStatus,
};
