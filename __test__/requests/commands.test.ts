import assert from "node:assert/strict";
import test from "node:test";
import { API_COMMANDS } from "../../src/requests/api/commands.js";

test("API_COMMANDS is assembled from every API-owned command", () => {
  assert.deepEqual(API_COMMANDS, [
    "queryAsyncJobResult",
    "createVpc",
    "createNetwork",
    "createNetworkACLList",
    "createNetworkACL",
    "replaceNetworkACLList",
    "deployVirtualMachine",
    "listPublicIpAddresses",
    "enableStaticNat",
    "deleteVpc",
    "deleteNetwork",
  ]);
});
