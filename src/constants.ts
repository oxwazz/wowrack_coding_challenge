export const CLI_DEFAULTS = {
  databaseFile: "src/database/__generated__/deployments.sqlite",
  casesDirectory: "src/interfaces/cli/cases",
  jobTimeoutMs: 30_000,
  maxRetries: 1,
} as const;

export function cloudStackApiUrl(): string {
  const apiUrl = process.env.CLOUDSTACK_API_URL;
  if (apiUrl === undefined || apiUrl.trim() === "") {
    throw new Error(
      "CLOUDSTACK_API_URL belum diatur.",
    );
  }
  return apiUrl;
}

export const CLOUDSTACK_JOB_IDS = {
  vpc: "vpc",
  subnet: "subnet",
  aclList: "acl-list",
  aclRule: "acl-rule",
  attachAcl: "attach-acl",
  vm: "vm",
  publicIp: "public-ip",
  staticNat: "static-nat",
} as const;

export const CLOUDSTACK_JOB_DEFINITION_IDS = {
  withPublicIp: "deploy-vm-with-public-ip",
  withoutPublicIp: "deploy-vm-without-public-ip",
} as const;

export const CLOUDSTACK_HANDLER_TYPES = {
  createVpc: "create_vpc",
  createSubnet: "create_subnet",
  createAclList: "create_acl_list",
  createAclRule: "create_acl_rule",
  attachAclList: "attach_acl_list",
  deployVm: "deploy_vm",
  listPublicIp: "list_public_ip",
  enableStaticNat: "enable_static_nat",
} as const;

export const DOCUMENTED_COMMANDS = [
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
] as const;

export const JOB_STATUSES = [
  "PENDING",
  "READY",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "RETRYING",
  "ROLLING_BACK",
  "ROLLED_BACK",
  "ROLLBACK_SKIPPED",
  "ROLLBACK_FAILED",
  "SKIPPED",
] as const;

export const JOB_RUN_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "ROLLING_BACK",
  "ROLLED_BACK",
  "ROLLBACK_FAILED",
] as const;
