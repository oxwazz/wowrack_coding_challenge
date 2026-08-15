import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiJobSpec } from "./shared.js";
import { runAsyncObject } from "./shared.js";

export const deployVirtualMachineCommand = "deployVirtualMachine" as const;

export const deployVirtualMachineSpec = {
  id: "vm",
  handler: "deploy_vm",
  dependsOn: ["subnet"],
} as const satisfies ApiJobSpec;

export type DeployVirtualMachineQuery = ApiControlQuery & Readonly<{
  networkids: string;
  serviceofferingid: string;
  templateid: string;
  name?: string | undefined;
}>;

export interface DeployVirtualMachineProps {
  client: FakeCloudStackClient;
  query: DeployVirtualMachineQuery;
  signal?: AbortSignal | undefined;
}

export type DeployVirtualMachineResult = JsonObject & { id: string };

export async function deployVirtualMachine(
  props: DeployVirtualMachineProps,
): Promise<DeployVirtualMachineResult> {
  const result = await runAsyncObject(
    props.client,
    deployVirtualMachineCommand,
    props.query,
    "virtualmachine",
    props.signal,
  );
  return result as DeployVirtualMachineResult;
}
