// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentkeyRegistry} from "../src/AgentkeyRegistry.sol";

contract AgentkeyRegistryTest is Test {
    AgentkeyRegistry internal registry;
    address internal issuer = address(0xA11CE);
    address internal stranger = address(0xB0B);

    string internal constant AGENT_ID = "ak_0123456789abcdef0123456789abcdef";
    string internal constant PUBKEY =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    function setUp() public {
        registry = new AgentkeyRegistry(issuer);
    }

    function test_constructorSetsIssuer() public view {
        assertEq(registry.issuer(), issuer);
    }

    function test_constructorRevertsZeroIssuer() public {
        vm.expectRevert(AgentkeyRegistry.ZeroIssuer.selector);
        new AgentkeyRegistry(address(0));
    }

    function test_commitAndGet() public {
        bytes32 agentIdHash = registry.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = registry.computeCommitment(AGENT_ID, PUBKEY);

        vm.prank(issuer);
        vm.expectEmit(true, false, true, true);
        emit AgentkeyRegistry.Committed(agentIdHash, commitment, issuer);
        registry.commit(agentIdHash, commitment);

        (bytes32 stored, bool revoked, bool exists) = registry.get(agentIdHash);
        assertEq(stored, commitment);
        assertFalse(revoked);
        assertTrue(exists);
    }

    function test_commitRevertsNotIssuer() public {
        bytes32 agentIdHash = registry.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = registry.computeCommitment(AGENT_ID, PUBKEY);

        vm.prank(stranger);
        vm.expectRevert(AgentkeyRegistry.NotIssuer.selector);
        registry.commit(agentIdHash, commitment);
    }

    function test_commitRevertsZeroCommitment() public {
        bytes32 agentIdHash = registry.computeAgentIdHash(AGENT_ID);

        vm.prank(issuer);
        vm.expectRevert(AgentkeyRegistry.ZeroCommitment.selector);
        registry.commit(agentIdHash, bytes32(0));
    }

    function test_commitRevertsAlreadyCommitted() public {
        bytes32 agentIdHash = registry.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = registry.computeCommitment(AGENT_ID, PUBKEY);

        vm.startPrank(issuer);
        registry.commit(agentIdHash, commitment);
        vm.expectRevert(AgentkeyRegistry.AlreadyCommitted.selector);
        registry.commit(agentIdHash, commitment);
        vm.stopPrank();
    }

    function test_revoke() public {
        bytes32 agentIdHash = registry.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = registry.computeCommitment(AGENT_ID, PUBKEY);

        vm.startPrank(issuer);
        registry.commit(agentIdHash, commitment);
        vm.expectEmit(true, true, false, true);
        emit AgentkeyRegistry.Revoked(agentIdHash, issuer);
        registry.revoke(agentIdHash);
        vm.stopPrank();

        (bytes32 stored, bool revoked, bool exists) = registry.get(agentIdHash);
        assertEq(stored, commitment);
        assertTrue(revoked);
        assertTrue(exists);
    }

    function test_revokeRevertsUnknown() public {
        bytes32 agentIdHash = registry.computeAgentIdHash(AGENT_ID);

        vm.prank(issuer);
        vm.expectRevert(AgentkeyRegistry.UnknownAgent.selector);
        registry.revoke(agentIdHash);
    }

    function test_revokeRevertsAlreadyRevoked() public {
        bytes32 agentIdHash = registry.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = registry.computeCommitment(AGENT_ID, PUBKEY);

        vm.startPrank(issuer);
        registry.commit(agentIdHash, commitment);
        registry.revoke(agentIdHash);
        vm.expectRevert(AgentkeyRegistry.AlreadyRevoked.selector);
        registry.revoke(agentIdHash);
        vm.stopPrank();
    }

    function test_revokeRevertsNotIssuer() public {
        bytes32 agentIdHash = registry.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = registry.computeCommitment(AGENT_ID, PUBKEY);

        vm.prank(issuer);
        registry.commit(agentIdHash, commitment);

        vm.prank(stranger);
        vm.expectRevert(AgentkeyRegistry.NotIssuer.selector);
        registry.revoke(agentIdHash);
    }

    function test_getUnknownReturnsEmpty() public view {
        bytes32 agentIdHash = registry.computeAgentIdHash("ak_missing");
        (bytes32 stored, bool revoked, bool exists) = registry.get(agentIdHash);
        assertEq(stored, bytes32(0));
        assertFalse(revoked);
        assertFalse(exists);
    }

    function test_commitmentMatchesKnownVector() public view {
        // Fixed vector so TS + Solidity stay aligned.
        bytes32 expected = keccak256(bytes(string.concat(AGENT_ID, ":", PUBKEY)));
        assertEq(registry.computeCommitment(AGENT_ID, PUBKEY), expected);
        assertEq(registry.computeAgentIdHash(AGENT_ID), keccak256(bytes(AGENT_ID)));
    }
}
