// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentkeyRegistry} from "../src/AgentkeyRegistry.sol";

/// @notice Deploy AgentkeyRegistry to a local Anvil (or any EVM) chain.
/// @dev Issuer defaults to the broadcast sender. Override with AGENTKEY_REGISTRY_ISSUER.
contract Deploy is Script {
    function run() external returns (AgentkeyRegistry registry) {
        vm.startBroadcast();
        // After startBroadcast, msg.sender is the broadcaster (Anvil account #0 by default).
        address issuer = vm.envOr("AGENTKEY_REGISTRY_ISSUER", msg.sender);
        registry = new AgentkeyRegistry(issuer);
        vm.stopBroadcast();

        console2.log("AgentkeyRegistry deployed at:", address(registry));
        console2.log("Issuer:", issuer);
    }
}
