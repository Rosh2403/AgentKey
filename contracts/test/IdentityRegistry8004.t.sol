// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry8004} from "../src/IdentityRegistry8004.sol";
import {IERC8004IdentityRegistry} from "../src/interfaces/IERC8004IdentityRegistry.sol";

contract IdentityRegistry8004Test is Test {
    IdentityRegistry8004 internal registry;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        registry = new IdentityRegistry8004();
    }

    function test_registerWithURI() public {
        vm.prank(alice);
        uint256 agentId = registry.register("ipfs://cid-agent");
        assertEq(agentId, 1);
        assertEq(registry.ownerOf(agentId), alice);
        assertEq(registry.tokenURI(agentId), "ipfs://cid-agent");
        assertEq(registry.getAgentURI(agentId), "ipfs://cid-agent");
        assertEq(registry.getAgentWallet(agentId), alice);
    }

    function test_registerWithMetadata() public {
        IERC8004IdentityRegistry.MetadataEntry[] memory metadata =
            new IERC8004IdentityRegistry.MetadataEntry[](1);
        metadata[0] = IERC8004IdentityRegistry.MetadataEntry({
            metadataKey: "agentkeyCommitment",
            metadataValue: abi.encodePacked(bytes32(uint256(0x42)))
        });

        vm.prank(alice);
        uint256 agentId = registry.register("https://example.com/agent.json", metadata);

        assertEq(registry.getMetadata(agentId, "agentkeyCommitment"), abi.encodePacked(bytes32(uint256(0x42))));
        // Reserved key cannot be set via metadata array.
        IERC8004IdentityRegistry.MetadataEntry[] memory bad =
            new IERC8004IdentityRegistry.MetadataEntry[](1);
        bad[0] = IERC8004IdentityRegistry.MetadataEntry({
            metadataKey: "agentWallet",
            metadataValue: abi.encodePacked(bob)
        });
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry8004.ReservedKey.selector);
        registry.register("https://example.com/b.json", bad);
    }

    function test_setAgentURI() public {
        vm.prank(alice);
        uint256 agentId = registry.register("ipfs://a");
        vm.prank(alice);
        registry.setAgentURI(agentId, "ipfs://b");
        assertEq(registry.tokenURI(agentId), "ipfs://b");
    }

    function test_setMetadataUnauthorized() public {
        vm.prank(alice);
        uint256 agentId = registry.register("ipfs://a");
        vm.prank(bob);
        vm.expectRevert(IdentityRegistry8004.NotAuthorized.selector);
        registry.setMetadata(agentId, "k", bytes("v"));
    }

    function test_transferClearsAgentWallet() public {
        vm.prank(alice);
        uint256 agentId = registry.register("ipfs://a");
        assertEq(registry.getAgentWallet(agentId), alice);

        vm.prank(alice);
        registry.transferFrom(alice, bob, agentId);
        assertEq(registry.ownerOf(agentId), bob);
        assertEq(registry.getAgentWallet(agentId), address(0));
    }

    function test_registerEmptyIncrements() public {
        vm.prank(alice);
        uint256 a = registry.register();
        vm.prank(bob);
        uint256 b = registry.register();
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(registry.lastAgentId(), 2);
    }
}
