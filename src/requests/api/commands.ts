import { createNetworkAclListApi } from "./create-network-acl-list.js";
import { createNetworkAclApi } from "./create-network-acl.js";
import { createNetworkApi } from "./create-network.js";
import { createVpcApi } from "./create-vpc.js";
import { deleteNetworkApi } from "./delete-network.js";
import { deleteVpcApi } from "./delete-vpc.js";
import { deployVirtualMachineApi } from "./deploy-virtual-machine.js";
import { destroyVirtualMachineApi } from "./destroy-virtual-machine.js";
import { enableStaticNatApi } from "./enable-static-nat.js";
import { listPublicIpAddressesApi } from "./list-public-ip-addresses.js";
import { queryAsyncJobResultApi } from "./query-async-job-result.js";
import { replaceNetworkAclListApi } from "./replace-network-acl-list.js";

/** Command metadata assembled from the command constants owned by each API file. */
export const API_COMMANDS = [
  queryAsyncJobResultApi.command,
  createVpcApi.command,
  createNetworkApi.command,
  createNetworkAclListApi.command,
  createNetworkAclApi.command,
  replaceNetworkAclListApi.command,
  deployVirtualMachineApi.command,
  listPublicIpAddressesApi.command,
  enableStaticNatApi.command,
  destroyVirtualMachineApi.command,
  deleteVpcApi.command,
  deleteNetworkApi.command,
] as const;


export type ApiCommand = (typeof API_COMMANDS)[number];
export type AsyncApiCommand = Exclude<
  ApiCommand,
  typeof queryAsyncJobResultApi.command
>;
