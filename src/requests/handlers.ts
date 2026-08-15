import { CLOUDSTACK_HANDLER_TYPES } from "../constants.js";
import type {
  ApiParameters,
  DocumentedCommand,
  HandlerRegistry,
  JobRollbackContext,
  JobRunContext,
  JsonObject,
} from "../types.js";
import {
  asObject,
  FakeCloudStackClient,
  requiredArray,
  requiredObject,
  requiredString,
} from "./client.js";

type ResultKey = "vpc" | "networkacllist" | "networkacl" | "virtualmachine";

export function createCloudStackHandlers(
  client: FakeCloudStackClient,
): HandlerRegistry {
  return {
    [CLOUDSTACK_HANDLER_TYPES.createVpc]: {
      async run(context) {
        const input = inputObject(context);
        return runAsyncObject(
          client,
          "createVpc",
          {
            cidr: requiredInputString(input, "cidr", context.jobId),
            name: optionalInputString(input, "name"),
            ...apiControl(input),
          },
          "vpc",
          context,
        );
      },
      async rollback(context) {
        const result = resultObject(context);
        await runAsyncSuccess(
          client,
          "deleteVpc",
          { id: requiredString(result, "id", `${context.jobId} result`), result: 1 },
          context,
        );
      },
    },

    [CLOUDSTACK_HANDLER_TYPES.createSubnet]: {
      async run(context) {
        const input = inputObject(context);
        const vpc = dependencyObject(context, "vpc");
        const response = await client.request(
          "createNetwork",
          {
            vpcid: requiredString(vpc, "id", "vpc result"),
            name: requiredInputString(input, "name", context.jobId),
            gateway: requiredInputString(input, "gateway", context.jobId),
            netmask: requiredInputString(input, "netmask", context.jobId),
            ...apiControl(input),
          },
          context.signal,
        );
        return requiredObject(response, "network", "createNetwork response");
      },
      async rollback(context) {
        const result = resultObject(context);
        await runAsyncSuccess(
          client,
          "deleteNetwork",
          { id: requiredString(result, "id", `${context.jobId} result`), result: 1 },
          context,
        );
      },
    },

    [CLOUDSTACK_HANDLER_TYPES.createAclList]: {
      async run(context) {
        const input = inputObject(context);
        const vpc = dependencyObject(context, "vpc");
        return runAsyncObject(
          client,
          "createNetworkACLList",
          {
            vpcid: requiredString(vpc, "id", "vpc result"),
            name: requiredInputString(input, "name", context.jobId),
            ...apiControl(input),
          },
          "networkacllist",
          context,
        );
      },
    },

    [CLOUDSTACK_HANDLER_TYPES.createAclRule]: {
      async run(context) {
        const input = inputObject(context);
        const aclList = dependencyObject(context, "acl-list");
        return runAsyncObject(
          client,
          "createNetworkACL",
          {
            aclid: requiredString(aclList, "id", "acl-list result"),
            protocol: requiredInputString(input, "protocol", context.jobId),
            cidrlist: optionalInputString(input, "cidrList"),
            action: optionalInputString(input, "action"),
            traffictype: optionalInputString(input, "trafficType"),
            startport: optionalInputNumber(input, "startPort"),
            endport: optionalInputNumber(input, "endPort"),
            ...apiControl(input),
          },
          "networkacl",
          context,
        );
      },
    },

    [CLOUDSTACK_HANDLER_TYPES.attachAclList]: {
      async run(context) {
        const input = inputObject(context);
        const subnet = dependencyObject(context, "subnet");
        const aclRule = dependencyObject(context, "acl-rule");
        const aclListId = requiredString(aclRule, "aclid", "acl-rule result");
        const networkId = requiredString(subnet, "id", "subnet result");
        await runAsyncSuccess(
          client,
          "replaceNetworkACLList",
          { aclid: aclListId, networkid: networkId, ...apiControl(input) },
          context,
        );
        return { success: true, aclListId, networkId };
      },
    },

    [CLOUDSTACK_HANDLER_TYPES.deployVm]: {
      async run(context) {
        const input = inputObject(context);
        const attachment = dependencyObject(context, "attach-acl");
        return runAsyncObject(
          client,
          "deployVirtualMachine",
          {
            networkids: requiredString(attachment, "networkId", "attach-acl result"),
            serviceofferingid: requiredInputString(input, "serviceOfferingId", context.jobId),
            templateid: requiredInputString(input, "templateId", context.jobId),
            name: optionalInputString(input, "name"),
            ...apiControl(input),
          },
          "virtualmachine",
          context,
        );
      },
    },

    [CLOUDSTACK_HANDLER_TYPES.listPublicIp]: {
      async run(context) {
        const response = await client.request(
          "listPublicIpAddresses",
          apiControl(inputObject(context)),
          context.signal,
        );
        const addresses = requiredArray(
          response,
          "publicipaddress",
          "listPublicIpAddresses response",
        );
        const freeAddress = addresses
          .map((address, index) => asObject(address, `publicipaddress[${index}]`))
          .find((address) => String(address.state).toLowerCase() === "free");
        if (freeAddress === undefined) {
          throw new Error("No free public IP address is available");
        }
        requiredString(freeAddress, "id", "free public IP");
        return freeAddress;
      },
    },

    [CLOUDSTACK_HANDLER_TYPES.enableStaticNat]: {
      async run(context) {
        const input = inputObject(context);
        const vm = dependencyObject(context, "vm");
        const publicIp = dependencyObject(context, "public-ip");
        const networkId = vmNetworkId(vm);
        const publicIpId = requiredString(publicIp, "id", "public-ip result");
        const virtualMachineId = requiredString(vm, "id", "vm result");
        const response = await client.request(
          "enableStaticNat",
          {
            networkid: networkId,
            ipaddressid: publicIpId,
            virtualmachineid: virtualMachineId,
            ...apiControl(input),
          },
          context.signal,
        );
        if (response.success !== true) {
          throw new Error("enableStaticNat did not return success=true");
        }
        return {
          ...response,
          networkId,
          publicIpId,
          virtualMachineId,
        };
      },
    },
  };
}

async function runAsyncObject(
  client: FakeCloudStackClient,
  command: Exclude<DocumentedCommand, "queryAsyncJobResult">,
  parameters: ApiParameters,
  resultKey: ResultKey,
  context: JobRunContext,
): Promise<JsonObject> {
  const result = await runAsync(client, command, parameters, context);
  return requiredObject(result, resultKey, `${command} async result`);
}

async function runAsyncSuccess(
  client: FakeCloudStackClient,
  command: Exclude<DocumentedCommand, "queryAsyncJobResult">,
  parameters: ApiParameters,
  context: JobRunContext | JobRollbackContext,
): Promise<void> {
  const result = await runAsync(client, command, parameters, context);
  if (result.success !== true) {
    throw new Error(`${command} did not return success=true`);
  }
}

async function runAsync(
  client: FakeCloudStackClient,
  command: Exclude<DocumentedCommand, "queryAsyncJobResult">,
  parameters: ApiParameters,
  context: JobRunContext | JobRollbackContext,
): Promise<JsonObject> {
  const asyncJobId = await client.startAsyncJob(command, parameters, context.signal);
  return client.waitForAsyncJob(asyncJobId, context.signal);
}

function inputObject(context: Pick<JobRunContext, "input" | "jobId">): JsonObject {
  return asObject(context.input ?? {}, `${context.jobId} input`);
}

function resultObject(context: Pick<JobRollbackContext, "result" | "jobId">): JsonObject {
  return asObject(context.result ?? {}, `${context.jobId} result`);
}

function dependencyObject(context: JobRunContext, dependencyId: string): JsonObject {
  return asObject(
    context.dependencyResults[dependencyId] ?? undefined,
    `${context.jobId} dependency ${dependencyId}`,
  );
}

function requiredInputString(input: JsonObject, key: string, jobId: string): string {
  return requiredString(input, key, `${jobId} input`);
}

function optionalInputString(input: JsonObject, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function optionalInputNumber(input: JsonObject, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function apiControl(input: JsonObject): ApiParameters {
  const controlValue = input.apiControl;
  const control = controlValue === undefined ? {} : asObject(controlValue, "apiControl");
  return {
    result: typeof control.result === "number" ? control.result : 1,
    delay: typeof control.delay === "number" ? control.delay : undefined,
    timeout: typeof control.timeout === "number" ? control.timeout : undefined,
  };
}

function vmNetworkId(vm: JsonObject): string {
  if (typeof vm.networkid === "string" && vm.networkid !== "") return vm.networkid;
  for (const [index, value] of (Array.isArray(vm.nic) ? vm.nic : []).entries()) {
    const nic = asObject(value, `vm.nic[${index}]`);
    if (typeof nic.networkid === "string" && nic.networkid !== "") return nic.networkid;
  }
  throw new Error("deployVirtualMachine result does not contain a network ID");
}
