import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery } from "./shared.js";
import { runAsyncObject } from "./shared.js";

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
    "deployVirtualMachine",
    props.query,
    "virtualmachine",
    props.signal,
  );
  return result as DeployVirtualMachineResult;
}
