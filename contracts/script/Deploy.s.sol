// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentkeyRegistry} from "../src/AgentkeyRegistry.sol";
import {IdentityRegistry8004} from "../src/IdentityRegistry8004.sol";
import {AgentkeyErc8004Adapter} from "../src/AgentkeyErc8004Adapter.sol";

/// @notice Deploy hybrid Agentkey registry and optional ERC-8004 dual-write stack.
/// @dev Env:
///   AGENTKEY_REGISTRY_ISSUER — root issuer (default: broadcast sender)
///   AGENTKEY_DEPLOY_ERC8004=true — deploy IdentityRegistry8004 + Adapter (default: true)
contract Deploy is Script {
    function run()
        external
        returns (
            AgentkeyRegistry registry,
            IdentityRegistry8004 identity,
            AgentkeyErc8004Adapter adapter
        )
    {
        vm.startBroadcast();
        address issuer = vm.envOr("AGENTKEY_REGISTRY_ISSUER", msg.sender);
        bool deployErc8004 = vm.envOr("AGENTKEY_DEPLOY_ERC8004", true);

        if (deployErc8004) {
            identity = new IdentityRegistry8004();
            adapter = new AgentkeyErc8004Adapter(issuer, address(identity));
            registry = adapter.agentkeyRegistry();
            console2.log("IdentityRegistry8004 deployed at:", address(identity));
            console2.log("AgentkeyErc8004Adapter deployed at:", address(adapter));
            console2.log("AgentkeyRegistry (nested) at:", address(registry));
            console2.log("Point AGENTKEY_REGISTRY_ADDRESS at the adapter for dual-write commit/revoke.");
            console2.log("Optional AGENTKEY_ERC8004_ADDRESS:", address(identity));
        } else {
            registry = new AgentkeyRegistry(issuer);
            console2.log("AgentkeyRegistry deployed at:", address(registry));
            console2.log("ERC-8004 skipped (AGENTKEY_DEPLOY_ERC8004=false).");
        }

        console2.log("Issuer:", issuer);
        vm.stopBroadcast();
    }
}
