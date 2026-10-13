// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentkeyRegistry} from "../src/AgentkeyRegistry.sol";
import {IdentityRegistry8004} from "../src/IdentityRegistry8004.sol";
import {AgentkeyErc8004Adapter} from "../src/AgentkeyErc8004Adapter.sol";
import {IERC8004IdentityRegistry} from "../src/interfaces/IERC8004IdentityRegistry.sol";

contract AgentkeyErc8004AdapterTest is Test {
    IdentityRegistry8004 internal identity;
    AgentkeyErc8004Adapter internal adapter;
    address internal issuer = address(0xA11CE);
    address internal stranger = address(0xB0B);

    string internal constant AGENT_ID = "ak_0123456789abcdef0123456789abcdef";
    string internal constant PUBKEY =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    function setUp() public {
        identity = new IdentityRegistry8004();
        adapter = new AgentkeyErc8004Adapter(issuer, address(identity));
    }

    function test_constructorWiresIssuerAndNestedRegistry() public view {
        assertEq(adapter.issuer(), issuer);
        assertEq(address(adapter.identityRegistry()), address(identity));
        assertEq(adapter.agentkeyRegistry().issuer(), address(adapter));
    }

    function test_commitDualWrites() public {
        bytes32 agentIdHash = adapter.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = adapter.computeCommitment(AGENT_ID, PUBKEY);

        vm.prank(issuer);
        uint256 erc8004Id = adapter.commit(agentIdHash, commitment);

        assertEq(erc8004Id, 1);
        assertEq(adapter.erc8004AgentIdOf(agentIdHash), 1);
        assertEq(adapter.agentIdHashOf(1), agentIdHash);

        (bytes32 stored, bool revoked, bool exists) = adapter.get(agentIdHash);
        assertEq(stored, commitment);
        assertFalse(revoked);
        assertTrue(exists);

        // NFT owned by root issuer after dual-write.
        assertEq(identity.ownerOf(erc8004Id), issuer);
        assertEq(
            identity.getMetadata(erc8004Id, "agentkeyAgentIdHash"),
            abi.encodePacked(agentIdHash)
        );
        assertEq(
            identity.getMetadata(erc8004Id, "agentkeyCommitment"),
            abi.encodePacked(commitment)
        );
        assertTrue(bytes(identity.tokenURI(erc8004Id)).length > 0);
    }

    function test_commitAndRegisterCustomURI() public {
        bytes32 agentIdHash = adapter.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = adapter.computeCommitment(AGENT_ID, PUBKEY);
        IERC8004IdentityRegistry.MetadataEntry[] memory metadata =
            new IERC8004IdentityRegistry.MetadataEntry[](1);
        metadata[0] = IERC8004IdentityRegistry.MetadataEntry({
            metadataKey: "agentkeyPublicHandle",
            metadataValue: bytes("demo-agent")
        });

        vm.prank(issuer);
        uint256 erc8004Id = adapter.commitAndRegister(
            agentIdHash, commitment, "ipfs://agentkey-demo", metadata
        );

        assertEq(identity.tokenURI(erc8004Id), "ipfs://agentkey-demo");
        assertEq(identity.getMetadata(erc8004Id, "agentkeyPublicHandle"), bytes("demo-agent"));
    }

    function test_commitRevertsNotIssuer() public {
        bytes32 agentIdHash = adapter.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = adapter.computeCommitment(AGENT_ID, PUBKEY);

        vm.prank(stranger);
        vm.expectRevert(AgentkeyErc8004Adapter.NotIssuer.selector);
        adapter.commit(agentIdHash, commitment);
    }

    function test_commitRevertsAlreadyMapped() public {
        bytes32 agentIdHash = adapter.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = adapter.computeCommitment(AGENT_ID, PUBKEY);

        vm.startPrank(issuer);
        adapter.commit(agentIdHash, commitment);
        vm.expectRevert(AgentkeyErc8004Adapter.AlreadyMapped.selector);
        adapter.commit(agentIdHash, commitment);
        vm.stopPrank();
    }

    function test_revokeDualWrite() public {
        bytes32 agentIdHash = adapter.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = adapter.computeCommitment(AGENT_ID, PUBKEY);

        vm.startPrank(issuer);
        uint256 erc8004Id = adapter.commit(agentIdHash, commitment);
        adapter.revoke(agentIdHash);
        vm.stopPrank();

        (, bool revoked, bool exists) = adapter.get(agentIdHash);
        assertTrue(revoked);
        assertTrue(exists);
        assertTrue(adapter.dualRevoked(agentIdHash));
        assertEq(adapter.erc8004AgentIdOf(agentIdHash), erc8004Id);
        // Nested AgentkeyRegistry also revoked.
        AgentkeyRegistry nested = adapter.agentkeyRegistry();
        (, bool nestedRevoked,) = nested.get(agentIdHash);
        assertTrue(nestedRevoked);
    }

    function test_revokeRevertsUnknown() public {
        bytes32 agentIdHash = adapter.computeAgentIdHash(AGENT_ID);
        vm.prank(issuer);
        vm.expectRevert(AgentkeyErc8004Adapter.UnknownMapping.selector);
        adapter.revoke(agentIdHash);
    }

    function test_commitmentVectorUnchanged() public view {
        // Same locked vector as AgentkeyRegistry / TS registry.test.ts
        bytes32 expected = keccak256(bytes(string.concat(AGENT_ID, ":", PUBKEY)));
        assertEq(adapter.computeCommitment(AGENT_ID, PUBKEY), expected);
    }
}
