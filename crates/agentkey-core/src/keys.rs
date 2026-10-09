//! Ed25519 hex key helpers — parallel of `packages/crypto` keys.ts.
//!
//! Public/private keys are raw 32-byte values hex-encoded (64 hex chars).
//! Signatures are 64-byte Ed25519 signatures hex-encoded (128 hex chars).
//! Messages are signed as UTF-8 bytes (same as TS `Buffer.from(message, "utf8")`).

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use thiserror::Error;

/// Key / signature encoding errors.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum KeyError {
    /// Hex string has wrong length or non-hex characters.
    #[error("invalid hex encoding")]
    InvalidHex,
    /// Bytes could not be interpreted as an Ed25519 key or signature.
    #[error("invalid Ed25519 key material")]
    InvalidKeyMaterial,
}

fn is_hex(value: &str, byte_length: usize) -> bool {
    value.len() == byte_length * 2
        && value.bytes().all(|b| b.is_ascii_hexdigit())
}

/// `true` if `public_key` is 32-byte hex.
pub fn is_valid_public_key_hex(public_key: &str) -> bool {
    is_hex(public_key, 32)
}

/// `true` if `private_key` is 32-byte hex (Ed25519 seed).
pub fn is_valid_private_key_hex(private_key: &str) -> bool {
    is_hex(private_key, 32)
}

/// `true` if `signature` is 64-byte hex.
pub fn is_valid_signature_hex(signature: &str) -> bool {
    is_hex(signature, 64)
}

fn decode_hex(value: &str, byte_length: usize) -> Result<Vec<u8>, KeyError> {
    if !is_hex(value, byte_length) {
        return Err(KeyError::InvalidHex);
    }
    hex::decode(value).map_err(|_| KeyError::InvalidHex)
}

/// Sign a UTF-8 message with a hex private seed; return hex signature.
pub fn sign_message(message: &str, private_key_hex: &str) -> Result<String, KeyError> {
    let seed = decode_hex(private_key_hex, 32)?;
    let seed_arr: [u8; 32] = seed.try_into().map_err(|_| KeyError::InvalidKeyMaterial)?;
    let signing = SigningKey::from_bytes(&seed_arr);
    let sig = signing.sign(message.as_bytes());
    Ok(hex::encode(sig.to_bytes()))
}

/// Verify a hex Ed25519 signature over a UTF-8 message.
///
/// Returns `false` on any encoding/crypto failure (fail closed at call sites).
pub fn verify_signature(message: &str, signature_hex: &str, public_key_hex: &str) -> bool {
    if !is_valid_signature_hex(signature_hex) || !is_valid_public_key_hex(public_key_hex) {
        return false;
    }
    let Ok(sig_bytes) = hex::decode(signature_hex) else {
        return false;
    };
    let Ok(pk_bytes) = hex::decode(public_key_hex) else {
        return false;
    };
    let Ok(sig_arr) = <[u8; 64]>::try_from(sig_bytes.as_slice()) else {
        return false;
    };
    let Ok(pk_arr) = <[u8; 32]>::try_from(pk_bytes.as_slice()) else {
        return false;
    };
    let Ok(verifying) = VerifyingKey::from_bytes(&pk_arr) else {
        return false;
    };
    let signature = Signature::from_bytes(&sig_arr);
    verifying.verify(message.as_bytes(), &signature).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_sign_verify() {
        let sk = "01".repeat(32);
        let msg = "agentkey-verify-v1\nak_1\nchal";
        let sig = sign_message(msg, &sk).unwrap();
        // Public key for seed 0x01… derived via dalek
        let seed: [u8; 32] = hex::decode(&sk).unwrap().try_into().unwrap();
        let pk = hex::encode(SigningKey::from_bytes(&seed).verifying_key().to_bytes());
        assert!(verify_signature(msg, &sig, &pk));
        assert!(!verify_signature(msg, &sig, &"00".repeat(32)));
    }
}
