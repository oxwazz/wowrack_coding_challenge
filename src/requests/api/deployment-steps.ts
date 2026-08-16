import { createNetworkAclListStep } from "./create-network-acl-list.js";
import { createNetworkAclStep } from "./create-network-acl.js";
import { createNetworkStep } from "./create-network.js";
import { createVpcStep } from "./create-vpc.js";
import { deployVirtualMachineStep } from "./deploy-virtual-machine.js";
import { enableStaticNatStep } from "./enable-static-nat.js";
import { listPublicIpAddressesStep } from "./list-public-ip-addresses.js";
import { replaceNetworkAclListStep } from "./replace-network-acl-list.js";

/** All steps that may be scheduled as nodes in a deployment job. */
export const DEPLOYMENT_STEP_SPECS = {
  [createVpcStep.id]: createVpcStep,
  [createNetworkStep.id]: createNetworkStep,
  [createNetworkAclListStep.id]: createNetworkAclListStep,
  [createNetworkAclStep.id]: createNetworkAclStep,
  [replaceNetworkAclListStep.id]: replaceNetworkAclListStep,
  [deployVirtualMachineStep.id]: deployVirtualMachineStep,
  [listPublicIpAddressesStep.id]: listPublicIpAddressesStep,
  [enableStaticNatStep.id]: enableStaticNatStep,
} as const;

export type DeploymentStepId = keyof typeof DEPLOYMENT_STEP_SPECS;
