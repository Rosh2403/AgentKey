// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentkeyErc8004Adapter} from "../src/AgentkeyErc8004Adapter.sol";

/// @notice One-shot demo: dual-write commit → ERC-8004 registration on a live Anvil deploy.
/// @dev Requires AGENTKEY_ADAPTER_ADDRESS (adapter from Deploy.s.sol).
contract DemoRegister is Script {
    string internal constant AGENT_ID = "ak_0123456789abcdef0123456789abcdef";
    string internal constant PUBKEY =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    function run() external {
        address adapterAddr = vm.envAddress("AGENTKEY_ADAPTER_ADDRESS");
        AgentkeyErc8004Adapter adapter = AgentkeyErc8004Adapter(adapterAddr);

        bytes32 agentIdHash = adapter.computeAgentIdHash(AGENT_ID);
        bytes32 commitment = adapter.computeCommitment(AGENT_ID, PUBKEY);

        vm.startBroadcast();
        uint256 erc8004Id = adapter.commit(agentIdHash, commitment);
        vm.stopBroadcast();

        console2.log("Dual-write OK");
        console2.log("agentIdHash:");
        console2.logBytes32(agentIdHash);
        console2.log("commitment:");
        console2.logBytes32(commitment);
        console2.log("erc8004AgentId:", erc8004Id);
    }
}
