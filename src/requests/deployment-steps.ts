import type {
  ApiParameters,
  DeploymentStepRegistry,
  JobRollbackContext,
  JobRunContext,
  JsonObject,
} from "../types.js";
import {
  asObject,
  FakeCloudStackClient,
  requiredString,
} from "./client.js";
import { createNetworkAclList } from "./api/create-network-acl-list.js";
import { createNetworkAcl } from "./api/create-network-acl.js";
import { createNetwork } from "./api/create-network.js";
import { createVpc } from "./api/create-vpc.js";
import { deleteNetwork } from "./api/delete-network.js";
import { deleteVpc } from "./api/delete-vpc.js";
import { deployVirtualMachine } from "./api/deploy-virtual-machine.js";
import { destroyVirtualMachine } from "./api/destroy-virtual-machine.js";
import { enableStaticNat } from "./api/enable-static-nat.js";
import { listPublicIpAddresses } from "./api/list-public-ip-addresses.js";
import { replaceNetworkAclList } from "./api/replace-network-acl-list.js";

/**
 * Builds the deployment registry containing DAG metadata and CloudStack behavior.
 * Each step reads persisted input and dependency results, then validates the API response.
 *
 * @param client - CloudStack client used by every run and rollback handler.
 * @returns A registry suitable for `DeploymentOrchestratorConfig.deploymentSteps`.
 *
 * @example
 * ```ts
 * const client = new FakeCloudStackClient({ baseUrl: "http://localhost:8080/client/api" });
 * const deploymentSteps = createDeploymentSteps(client);
 * const orchestrator = new DeploymentOrchestrator({
 *   databasePath: "deployments.sqlite",
 *   deploymentSteps,
 * });
 * ```
 */
export function createDeploymentSteps(
  client: FakeCloudStackClient,
) {
  return {
    vpc: {
      dependsOn: [],
      execution: "single",
      /** Creates a VPC and returns the object produced by the asynchronous API job. */
      async run(context) {
        const input = inputObject(context);
        return createVpc({
          client,
          query: {
            cidr: requiredInputString(input, "cidr", context.jobId),
            name: optionalInputString(input, "name"),
            ...apiControl(context),
          },
          signal: context.signal,
        });
      },
      /** Deletes the VPC created by this step. */
      async rollback(context) {
        const result = resultObject(context);
        await deleteVpc({
          client,
          query: {
            id: requiredString(result, "id", `${context.jobId} result`),
            ...rollbackApiControl(context),
          },
          signal: context.signal,
        });
      },
    },

    subnet: {
      dependsOn: ["vpc"],
      execution: "single",
      /** Creates a network inside the VPC produced by the dependency step. */
      async run(context) {
        const input = inputObject(context);
        const vpc = dependencyObject(context, "vpc");
        return createNetwork({
          client,
          query: {
            vpcid: requiredString(vpc, "id", "vpc result"),
            name: requiredInputString(input, "name", context.jobId),
            gateway: requiredInputString(input, "gateway", context.jobId),
            netmask: requiredInputString(input, "netmask", context.jobId),
            ...apiControl(context),
          },
          signal: context.signal,
        });
      },
      /** Deletes the network created by this step. */
      async rollback(context) {
        const result = resultObject(context);
        await deleteNetwork({
          client,
          query: {
            id: requiredString(result, "id", `${context.jobId} result`),
            ...rollbackApiControl(context),
          },
          signal: context.signal,
        });
      },
    },

    "acl-list": {
      dependsOn: ["vpc"],
      execution: "single",
      /** Creates a network ACL list for the dependency VPC. */
      async run(context) {
        const input = inputObject(context);
        const vpc = dependencyObject(context, "vpc");
        return createNetworkAclList({
          client,
          query: {
            vpcid: requiredString(vpc, "id", "vpc result"),
            name: requiredInputString(input, "name", context.jobId),
            ...apiControl(context),
          },
          signal: context.signal,
        });
      },
    },

    "acl-rule": {
      dependsOn: ["acl-list"],
      execution: "fan-out-leaf",
      /** Creates an ACL rule in the list produced by the dependency step. */
      async run(context) {
        const input = inputObject(context);
        const aclList = dependencyObject(context, "acl-list");
        return createNetworkAcl({
          client,
          query: {
            aclid: requiredString(aclList, "id", "acl-list result"),
            protocol: requiredInputString(input, "protocol", context.jobId),
            cidrlist: optionalInputString(input, "cidrList"),
            action: optionalInputString(input, "action"),
            traffictype: optionalInputString(input, "trafficType"),
            startport: optionalInputNumber(input, "startPort"),
            endport: optionalInputNumber(input, "endPort"),
            ...apiControl(context),
          },
          signal: context.signal,
        });
      },
    },

    "attach-acl": {
      dependsOn: ["subnet", "acl-list"],
      execution: "single",
      /** Replaces the subnet's ACL list with the list containing the configured rule. */
      async run(context) {
        const subnet = dependencyObject(context, "subnet");
        const aclList = dependencyObject(context, "acl-list");
        const aclListId = requiredString(aclList, "id", "acl-list result");
        const networkId = requiredString(subnet, "id", "subnet result");
        await replaceNetworkAclList({
          client,
          query: { aclid: aclListId, networkid: networkId, ...apiControl(context) },
          signal: context.signal,
        });
        return { success: true, aclListId, networkId };
      },
    },

    vm: {
      dependsOn: ["subnet"],
      execution: "single",
      /** Deploys a virtual machine directly on the subnet produced by createNetwork. */
      async run(context) {
        const input = inputObject(context);
        const subnet = dependencyObject(context, "subnet");
        return deployVirtualMachine({
          client,
          query: {
            networkids: requiredString(subnet, "id", "subnet result"),
            serviceofferingid: requiredInputString(input, "serviceOfferingId", context.jobId),
            templateid: requiredInputString(input, "templateId", context.jobId),
            name: optionalInputString(input, "name"),
            ...apiControl(context),
          },
          signal: context.signal,
        });
      },
      /** Destroys the virtual machine before its network and VPC are removed. */
      async rollback(context) {
        const result = resultObject(context);
        await destroyVirtualMachine({
          client,
          query: {
            id: requiredString(result, "id", `${context.jobId} result`),
            ...rollbackApiControl(context),
          },
          signal: context.signal,
        });
      },
    },

    "public-ip": {
      dependsOn: [],
      execution: "single",
      /** Returns the first free public IP address reported by CloudStack. */
      async run(context) {
        const addresses = await listPublicIpAddresses({
          client,
          query: apiControl(context),
          signal: context.signal,
        });
        // Preserve API ordering and select the first address that is currently allocatable.
        const freeAddress = addresses
          .find((address) => String(address.state).toLowerCase() === "free");
        if (freeAddress === undefined) {
          throw new Error("No free public IP address is available");
        }
        requiredString(freeAddress, "id", "free public IP");
        return freeAddress;
      },
    },

    "static-nat": {
      dependsOn: ["vm", "public-ip"],
      execution: "single",
      /** Enables static NAT between the selected public IP and deployed virtual machine. */
      async run(context) {
        const vm = dependencyObject(context, "vm");
        const publicIp = dependencyObject(context, "public-ip");
        // Fake responses may expose the network either directly or through the VM's NIC list.
        const networkId = vmNetworkId(vm);
        const publicIpId = requiredString(publicIp, "id", "public-ip result");
        const virtualMachineId = requiredString(vm, "id", "vm result");
        const response = await enableStaticNat({
          client,
          query: {
            networkid: networkId,
            ipaddressid: publicIpId,
            virtualmachineid: virtualMachineId,
            ...apiControl(context),
          },
          signal: context.signal,
        });
        return {
          ...response,
          networkId,
          publicIpId,
          virtualMachineId,
        };
      },
    },
  } as const satisfies DeploymentStepRegistry;
}

export type DeploymentStepId = keyof ReturnType<typeof createDeploymentSteps>;

/** Normalizes a job's optional input into a validated JSON object. */
function inputObject(context: Pick<JobRunContext, "input" | "jobId">): JsonObject {
  return asObject(context.input ?? {}, `${context.jobId} input`);
}

/** Normalizes a rollback job's optional result into a validated JSON object. */
function resultObject(context: Pick<JobRollbackContext, "result" | "jobId">): JsonObject {
  return asObject(context.result ?? {}, `${context.jobId} result`);
}

/** Reads and validates the result produced by one of the job's direct dependencies. */
function dependencyObject(context: JobRunContext, dependencyId: string): JsonObject {
  return asObject(
    context.dependencyResults[dependencyId] ?? undefined,
    `${context.jobId} dependency ${dependencyId}`,
  );
}

/** Reads a required string from job input using the job identifier in validation errors. */
function requiredInputString(input: JsonObject, key: string, jobId: string): string {
  return requiredString(input, key, `${jobId} input`);
}

/** Reads a non-empty optional string from job input. */
function optionalInputString(input: JsonObject, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Reads a finite optional number from job input. */
function optionalInputNumber(input: JsonObject, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Extracts fake-API timing and outcome controls while applying safe defaults. */
function apiControl(
  context: Pick<JobRunContext, "apiControl" | "attempt" | "input">,
): ApiParameters {
  // Reading the legacy input location keeps existing programmatic callers compatible.
  const input = asObject(context.input ?? {}, "job input");
  const controlValue = context.apiControl ?? input.apiControl;
  const control = controlValue === undefined ? {} : asObject(controlValue, "apiControl");
  return {
    // A configured sequence maps attempts to results and repeats its last value if exhausted.
    result: resultFromSequence(control.resultSequence, context.attempt)
      ?? (typeof control.result === "number" ? control.result : 1),
    delay: typeof control.delay === "number" ? control.delay : undefined,
    timeout: typeof control.timeout === "number" ? control.timeout : undefined,
  };
}

/** Extracts the fake-API result for one rollback attempt. */
function rollbackApiControl(
  context: Pick<JobRollbackContext, "apiControl" | "attempt">,
): ApiParameters {
  const control = context.apiControl === undefined
    ? {}
    : asObject(context.apiControl, "apiControl");
  return {
    result: resultFromSequence(control.rollbackResultSequence, context.attempt) ?? 1,
  };
}

/** Maps a one-based attempt number to a finite sequence value, repeating the last value. */
function resultFromSequence(
  value: JsonObject[string] | undefined,
  attempt: number,
): number | undefined {
  const sequence = Array.isArray(value)
    ? value.filter(
      (candidate): candidate is number =>
        typeof candidate === "number" && Number.isFinite(candidate),
    )
    : [];
  const index = Math.min(attempt - 1, sequence.length - 1);
  return index >= 0 ? sequence[index] : undefined;
}

/** Finds the VM network identifier on either the VM object or one of its NICs. */
function vmNetworkId(vm: JsonObject): string {
  if (typeof vm.networkid === "string" && vm.networkid !== "") return vm.networkid;
  // Realistic VM responses commonly nest the network ID inside a NIC entry.
  for (const [index, value] of (Array.isArray(vm.nic) ? vm.nic : []).entries()) {
    const nic = asObject(value, `vm.nic[${index}]`);
    if (typeof nic.networkid === "string" && nic.networkid !== "") return nic.networkid;
  }
  throw new Error("deployVirtualMachine result does not contain a network ID");
}
