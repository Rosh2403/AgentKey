// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {AgentkeyRegistry} from "./AgentkeyRegistry.sol";
import {IdentityRegistry8004} from "./IdentityRegistry8004.sol";
import {IERC8004IdentityRegistry} from "./interfaces/IERC8004IdentityRegistry.sol";

/// @title AgentkeyErc8004Adapter
/// @notice Dual-write: Agentkey hybrid commit/revoke → ERC-8004 Identity registration.
/// @dev Single root issuer (locked A) authorizes writes. This adapter is the issuer of the
///      nested AgentkeyRegistry so commit/revoke stay gated. ERC-8004 NFT is minted to the
///      adapter then transferred to the root issuer (discovery ownership).
///      Product verify remains off-chain and works with AGENTKEY_ANCHOR_ENABLED=false.
///
///      ERC-8004 (draft) has no native revoke; Agentkey revoke is authoritative. This adapter
///      records `dualRevoked` and emits DualRevoked. Issuer (NFT owner) MAY also update
///      agentURI / metadata (`agentkeyRevoked`) for discovery indexers.
contract AgentkeyErc8004Adapter is IERC721Receiver {
    /// @notice Root issuer authorized to dual-write.
    address public immutable issuer;
    AgentkeyRegistry public immutable agentkeyRegistry;
    IdentityRegistry8004 public immutable identityRegistry;

    /// @dev agentIdHash → ERC-8004 tokenId (0 = none)
    mapping(bytes32 => uint256) public erc8004AgentIdOf;
    /// @dev ERC-8004 tokenId → agentIdHash
    mapping(uint256 => bytes32) public agentIdHashOf;
    /// @dev Dual-write revoke flag (ERC-8004 has no native revoke).
    mapping(bytes32 => bool) public dualRevoked;

    event DualCommitted(
        bytes32 indexed agentIdHash,
        bytes32 commitment,
        uint256 indexed erc8004AgentId,
        string agentURI,
        address indexed by
    );
    event DualRevoked(bytes32 indexed agentIdHash, uint256 indexed erc8004AgentId, address indexed by);

    error NotIssuer();
    error ZeroIssuer();
    error ZeroIdentity();
    error AlreadyMapped();
    error UnknownMapping();
    error AlreadyDualRevoked();

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    /// @param issuer_ Root issuer EOA/contract (single-root bootstrap).
    /// @param identityRegistry_ Deployed IdentityRegistry8004.
    constructor(address issuer_, address identityRegistry_) {
        if (issuer_ == address(0)) revert ZeroIssuer();
        if (identityRegistry_ == address(0)) revert ZeroIdentity();
        issuer = issuer_;
        identityRegistry = IdentityRegistry8004(identityRegistry_);
        // Nested Agentkey registry: this adapter is the only commit/revoke caller.
        agentkeyRegistry = new AgentkeyRegistry(address(this));
    }

    /// @notice Drop-in compatible with AgentkeyRegistry.commit + ERC-8004 register.
    /// @dev Builds a minimal on-chain agentURI encoding commitment hex for local demos.
    function commit(bytes32 agentIdHash, bytes32 commitment) external onlyIssuer returns (uint256 erc8004AgentId) {
        string memory uri = _defaultAgentURI(agentIdHash, commitment);
        return commitAndRegister(agentIdHash, commitment, uri, new IERC8004IdentityRegistry.MetadataEntry[](0));
    }

    /// @notice Dual-write with explicit agentURI and optional ERC-8004 metadata.
    function commitAndRegister(
        bytes32 agentIdHash,
        bytes32 commitment,
        string memory agentURI_,
        IERC8004IdentityRegistry.MetadataEntry[] memory metadata
    ) public onlyIssuer returns (uint256 erc8004AgentId) {
        if (erc8004AgentIdOf[agentIdHash] != 0) revert AlreadyMapped();

        agentkeyRegistry.commit(agentIdHash, commitment);

        // Enrich metadata with Agentkey binding (non-reserved keys).
        IERC8004IdentityRegistry.MetadataEntry[] memory enriched =
            new IERC8004IdentityRegistry.MetadataEntry[](metadata.length + 2);
        for (uint256 i; i < metadata.length; i++) {
            enriched[i] = metadata[i];
        }
        enriched[metadata.length] = IERC8004IdentityRegistry.MetadataEntry({
            metadataKey: "agentkeyAgentIdHash",
            metadataValue: abi.encodePacked(agentIdHash)
        });
        enriched[metadata.length + 1] = IERC8004IdentityRegistry.MetadataEntry({
            metadataKey: "agentkeyCommitment",
            metadataValue: abi.encodePacked(commitment)
        });

        erc8004AgentId = identityRegistry.register(agentURI_, enriched);
        // Discovery ownership sits with the root issuer (not the adapter).
        // Per draft EIP-8004, transfer clears agentWallet; issuer may re-bind later.
        identityRegistry.transferFrom(address(this), issuer, erc8004AgentId);

        erc8004AgentIdOf[agentIdHash] = erc8004AgentId;
        agentIdHashOf[erc8004AgentId] = agentIdHash;

        emit DualCommitted(agentIdHash, commitment, erc8004AgentId, agentURI_, msg.sender);
    }

    /// @notice Revoke Agentkey anchor; mark dual-write revoked (ERC-8004 has no native revoke).
    function revoke(bytes32 agentIdHash) external onlyIssuer {
        uint256 erc8004AgentId = erc8004AgentIdOf[agentIdHash];
        if (erc8004AgentId == 0) revert UnknownMapping();
        if (dualRevoked[agentIdHash]) revert AlreadyDualRevoked();

        agentkeyRegistry.revoke(agentIdHash);
        dualRevoked[agentIdHash] = true;

        emit DualRevoked(agentIdHash, erc8004AgentId, msg.sender);
    }

    /// @notice Read-through to nested AgentkeyRegistry.get.
    function get(bytes32 agentIdHash)
        external
        view
        returns (bytes32 commitment, bool revoked, bool exists)
    {
        return agentkeyRegistry.get(agentIdHash);
    }

    function computeCommitment(string calldata agentId, string calldata publicKeyHex)
        external
        view
        returns (bytes32)
    {
        return agentkeyRegistry.computeCommitment(agentId, publicKeyHex);
    }

    function computeAgentIdHash(string calldata agentId) external view returns (bytes32) {
        return agentkeyRegistry.computeAgentIdHash(agentId);
    }

    /// @inheritdoc IERC721Receiver
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    function _defaultAgentURI(bytes32 agentIdHash, bytes32 commitment)
        internal
        pure
        returns (string memory)
    {
        // Minimal discoverable URI for local demos (not a full registration JSON file).
        // Production should pass ipfs:// or https:// agent registration file URI.
        return string.concat("agentkey:v1:", _hex(agentIdHash), ":", _hex(commitment));
    }

    function _hex(bytes32 data) internal pure returns (string memory) {
        bytes16 hexSymbols = "0123456789abcdef";
        bytes memory str = new bytes(66);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(data[i]);
            str[2 + i * 2] = hexSymbols[b >> 4];
            str[3 + i * 2] = hexSymbols[b & 0x0f];
        }
        return string(str);
    }
}
