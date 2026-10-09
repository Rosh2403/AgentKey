// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentkeyRegistry
/// @notice Minimal hybrid on-chain anchor: Agent ID ↔ pubkey commitment + revoke.
/// @dev Not the product surface. Issue / resolve / verify stay off-chain (TypeScript).
///      Single root issuer (locked A) is the only address allowed to commit/revoke.
contract AgentkeyRegistry {
    /// @notice Root issuer authorized to commit and revoke anchors.
    address public immutable issuer;

    struct Record {
        /// @dev keccak256(bytes(string.concat(agentId, ":", publicKeyHex)))
        bytes32 commitment;
        bool revoked;
        bool exists;
    }

    /// @dev agentIdHash = keccak256(bytes(agentId))
    mapping(bytes32 => Record) private _records;

    event Committed(
        bytes32 indexed agentIdHash,
        bytes32 commitment,
        address indexed by
    );
    event Revoked(bytes32 indexed agentIdHash, address indexed by);

    error NotIssuer();
    error AlreadyCommitted();
    error UnknownAgent();
    error AlreadyRevoked();
    error ZeroCommitment();
    error ZeroIssuer();

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    constructor(address issuer_) {
        if (issuer_ == address(0)) revert ZeroIssuer();
        issuer = issuer_;
    }

    /// @notice Commit an Agent ID ↔ pubkey binding hash. Idempotent reject if exists.
    function commit(bytes32 agentIdHash, bytes32 commitment) external onlyIssuer {
        if (commitment == bytes32(0)) revert ZeroCommitment();
        Record storage record = _records[agentIdHash];
        if (record.exists) revert AlreadyCommitted();
        record.commitment = commitment;
        record.exists = true;
        record.revoked = false;
        emit Committed(agentIdHash, commitment, msg.sender);
    }

    /// @notice Mark an existing commitment revoked (fail-closed for verifiers that check chain).
    function revoke(bytes32 agentIdHash) external onlyIssuer {
        Record storage record = _records[agentIdHash];
        if (!record.exists) revert UnknownAgent();
        if (record.revoked) revert AlreadyRevoked();
        record.revoked = true;
        emit Revoked(agentIdHash, msg.sender);
    }

    /// @notice Read commitment state. `exists == false` means never committed.
    function get(bytes32 agentIdHash)
        external
        view
        returns (bytes32 commitment, bool revoked, bool exists)
    {
        Record storage record = _records[agentIdHash];
        return (record.commitment, record.revoked, record.exists);
    }

    /// @notice Pure helper matching the TypeScript hybrid commitment scheme.
    function computeCommitment(string calldata agentId, string calldata publicKeyHex)
        external
        pure
        returns (bytes32)
    {
        // Concatenate then hash — avoids abi.encodePacked dynamic-type collision risk.
        return keccak256(bytes(string.concat(agentId, ":", publicKeyHex)));
    }

    /// @notice Pure helper: hash Agent ID string for mapping key.
    function computeAgentIdHash(string calldata agentId) external pure returns (bytes32) {
        return keccak256(bytes(agentId));
    }
}
