import { createNetworkAclListCommand } from "./create-network-acl-list.js";
import { createNetworkAclCommand } from "./create-network-acl.js";
import { createNetworkCommand } from "./create-network.js";
import { createVpcCommand } from "./create-vpc.js";
import { deleteNetworkCommand } from "./delete-network.js";
import { deleteVpcCommand } from "./delete-vpc.js";
import { deployVirtualMachineCommand } from "./deploy-virtual-machine.js";
import { enableStaticNatCommand } from "./enable-static-nat.js";
import { listPublicIpAddressesCommand } from "./list-public-ip-addresses.js";
import { queryAsyncJobResultCommand } from "./query-async-job-result.js";
import { replaceNetworkAclListCommand } from "./replace-network-acl-list.js";

/** Command metadata assembled from the command constants owned by each API file. */
export const API_COMMANDS = [
  queryAsyncJobResultCommand,
  createVpcCommand,
  createNetworkCommand,
  createNetworkAclListCommand,
  createNetworkAclCommand,
  replaceNetworkAclListCommand,
  deployVirtualMachineCommand,
  listPublicIpAddressesCommand,
  enableStaticNatCommand,
  deleteVpcCommand,
  deleteNetworkCommand,
] as const;


export type ApiCommand = (typeof API_COMMANDS)[number];
export type AsyncApiCommand = Exclude<ApiCommand, typeof queryAsyncJobResultCommand>;
