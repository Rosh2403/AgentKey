// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8004IdentityRegistry
/// @notice Best-effort interface for ERC-8004 Identity Registry (draft EIP-8004).
/// @dev Spec status: Draft — see https://eips.ethereum.org/EIPS/eip-8004
///      Agentkey implements a compatible subset for discovery dual-write.
///      Reputation / Validation registries are out of scope for this touchpoint.
interface IERC8004IdentityRegistry {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    function register() external returns (uint256 agentId);

    function register(string calldata agentURI) external returns (uint256 agentId);

    function register(string calldata agentURI, MetadataEntry[] calldata metadata)
        external
        returns (uint256 agentId);

    function getMetadata(uint256 agentId, string calldata metadataKey)
        external
        view
        returns (bytes memory);

    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue)
        external;

    function setAgentURI(uint256 agentId, string calldata newURI) external;

    function getAgentWallet(uint256 agentId) external view returns (address);

    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external;

    function unsetAgentWallet(uint256 agentId) external;
}
