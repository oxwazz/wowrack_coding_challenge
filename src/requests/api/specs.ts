import { createNetworkAclListSpec } from "./create-network-acl-list.js";
import { createNetworkAclSpec } from "./create-network-acl.js";
import { createNetworkSpec } from "./create-network.js";
import { createVpcSpec } from "./create-vpc.js";
import { deployVirtualMachineSpec } from "./deploy-virtual-machine.js";
import { enableStaticNatSpec } from "./enable-static-nat.js";
import { listPublicIpAddressesSpec } from "./list-public-ip-addresses.js";
import { replaceNetworkAclListSpec } from "./replace-network-acl-list.js";

/** All APIs that may be scheduled as nodes in a deployment job. */
export const API_JOB_SPECS = {
  [createVpcSpec.id]: createVpcSpec,
  [createNetworkSpec.id]: createNetworkSpec,
  [createNetworkAclListSpec.id]: createNetworkAclListSpec,
  [createNetworkAclSpec.id]: createNetworkAclSpec,
  [replaceNetworkAclListSpec.id]: replaceNetworkAclListSpec,
  [deployVirtualMachineSpec.id]: deployVirtualMachineSpec,
  [listPublicIpAddressesSpec.id]: listPublicIpAddressesSpec,
  [enableStaticNatSpec.id]: enableStaticNatSpec,
} as const;

export type ApiJobId = keyof typeof API_JOB_SPECS;
