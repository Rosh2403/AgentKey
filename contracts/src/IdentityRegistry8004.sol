// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC8004IdentityRegistry} from "./interfaces/IERC8004IdentityRegistry.sol";

/// @title IdentityRegistry8004
/// @notice Best-effort ERC-8004 Identity Registry (draft EIP-8004) for Agentkey hybrid dual-write.
/// @dev Non-upgradeable. Compatible surface: register / metadata / agentURI / agentWallet.
///      Spec is Draft — field names follow EIP-8004 as of 2025-08; see contracts/README.md.
contract IdentityRegistry8004 is ERC721URIStorage, EIP712, IERC8004IdentityRegistry {
    uint256 private _lastId;

    /// @dev agentId => metadataKey => value (includes reserved "agentWallet")
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    bytes32 private constant AGENT_WALLET_SET_TYPEHASH =
        keccak256("AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)");
    bytes4 private constant ERC1271_MAGICVALUE = 0x1626ba7e;
    uint256 private constant MAX_DEADLINE_DELAY = 5 minutes;
    bytes32 private constant RESERVED_AGENT_WALLET_KEY_HASH = keccak256("agentWallet");

    error NotAuthorized();
    error ReservedKey();
    error BadWallet();
    error ExpiredDeadline();
    error DeadlineTooFar();
    error InvalidWalletSig();

    constructor() ERC721("AgentIdentity", "AGENT") EIP712("ERC8004IdentityRegistry", "1") {}

    /// @inheritdoc IERC8004IdentityRegistry
    function register() external returns (uint256 agentId) {
        return _register("", new MetadataEntry[](0));
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function register(string calldata agentURI_) external returns (uint256 agentId) {
        return _register(agentURI_, new MetadataEntry[](0));
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function register(string calldata agentURI_, MetadataEntry[] calldata metadata)
        external
        returns (uint256 agentId)
    {
        return _register(agentURI_, metadata);
    }

    function _register(string memory agentURI_, MetadataEntry[] memory metadata)
        internal
        returns (uint256 agentId)
    {
        agentId = ++_lastId;
        _metadata[agentId]["agentWallet"] = abi.encodePacked(msg.sender);
        _safeMint(msg.sender, agentId);
        if (bytes(agentURI_).length > 0) {
            _setTokenURI(agentId, agentURI_);
        }
        emit Registered(agentId, agentURI_, msg.sender);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(msg.sender));

        for (uint256 i; i < metadata.length; i++) {
            if (keccak256(bytes(metadata[i].metadataKey)) == RESERVED_AGENT_WALLET_KEY_HASH) {
                revert ReservedKey();
            }
            _metadata[agentId][metadata[i].metadataKey] = metadata[i].metadataValue;
            emit MetadataSet(
                agentId,
                metadata[i].metadataKey,
                metadata[i].metadataKey,
                metadata[i].metadataValue
            );
        }
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function getMetadata(uint256 agentId, string calldata metadataKey)
        external
        view
        returns (bytes memory)
    {
        return _metadata[agentId][metadataKey];
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue)
        external
    {
        _requireAuthorized(agentId);
        if (keccak256(bytes(metadataKey)) == RESERVED_AGENT_WALLET_KEY_HASH) revert ReservedKey();
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        _requireAuthorized(agentId);
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function getAgentWallet(uint256 agentId) external view returns (address) {
        bytes memory walletData = _metadata[agentId]["agentWallet"];
        if (walletData.length < 20) return address(0);
        return address(bytes20(walletData));
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external {
        _requireAuthorized(agentId);
        if (newWallet == address(0)) revert BadWallet();
        if (block.timestamp > deadline) revert ExpiredDeadline();
        if (deadline > block.timestamp + MAX_DEADLINE_DELAY) revert DeadlineTooFar();

        address owner_ = ownerOf(agentId);
        bytes32 structHash =
            keccak256(abi.encode(AGENT_WALLET_SET_TYPEHASH, agentId, newWallet, owner_, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != newWallet) {
            (bool ok, bytes memory res) =
                newWallet.staticcall(abi.encodeCall(IERC1271.isValidSignature, (digest, signature)));
            if (!(ok && res.length >= 32 && abi.decode(res, (bytes4)) == ERC1271_MAGICVALUE)) {
                revert InvalidWalletSig();
            }
        }

        _metadata[agentId]["agentWallet"] = abi.encodePacked(newWallet);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(newWallet));
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function unsetAgentWallet(uint256 agentId) external {
        _requireAuthorized(agentId);
        _metadata[agentId]["agentWallet"] = "";
        emit MetadataSet(agentId, "agentWallet", "agentWallet", "");
    }

    /// @notice ERC-721 tokenURI is the ERC-8004 agentURI (alias for clarity).
    function getAgentURI(uint256 agentId) external view returns (string memory) {
        return tokenURI(agentId);
    }

    function lastAgentId() external view returns (uint256) {
        return _lastId;
    }

    function _requireAuthorized(uint256 agentId) internal view {
        address owner_ = ownerOf(agentId);
        if (!_isAuthorized(owner_, msg.sender, agentId)) revert NotAuthorized();
    }

    /// @dev Clear agentWallet on transfer (not mint/burn), per draft EIP-8004.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            _metadata[tokenId]["agentWallet"] = "";
            emit MetadataSet(tokenId, "agentWallet", "agentWallet", "");
        }
        return super._update(to, tokenId, auth);
    }
}
