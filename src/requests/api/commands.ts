import { createNetworkAclListSpec } from "./create-network-acl-list.js";
import { createNetworkAclSpec } from "./create-network-acl.js";
import { createNetworkSpec } from "./create-network.js";
import { createVpcSpec } from "./create-vpc.js";
import { deleteNetworkSpec } from "./delete-network.js";
import { deleteVpcSpec } from "./delete-vpc.js";
import { deployVirtualMachineSpec } from "./deploy-virtual-machine.js";
import { enableStaticNatSpec } from "./enable-static-nat.js";
import { listPublicIpAddressesSpec } from "./list-public-ip-addresses.js";
import { queryAsyncJobResultSpec } from "./query-async-job-result.js";
import { replaceNetworkAclListSpec } from "./replace-network-acl-list.js";

/** Command metadata assembled from the command constants owned by each API file. */
export const API_COMMANDS = [
  queryAsyncJobResultSpec.command,
  createVpcSpec.command,
  createNetworkSpec.command,
  createNetworkAclListSpec.command,
  createNetworkAclSpec.command,
  replaceNetworkAclListSpec.command,
  deployVirtualMachineSpec.command,
  listPublicIpAddressesSpec.command,
  enableStaticNatSpec.command,
  deleteVpcSpec.command,
  deleteNetworkSpec.command,
] as const;


export type ApiCommand = (typeof API_COMMANDS)[number];
export type AsyncApiCommand = Exclude<
  ApiCommand,
  typeof queryAsyncJobResultSpec.command
>;
