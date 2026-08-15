import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiRequestSpec } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const destroyVirtualMachineSpec = {
  command: "destroyVirtualMachine",
} as const satisfies ApiRequestSpec;

export type DestroyVirtualMachineQuery = ApiControlQuery & Readonly<{ id: string }>;

export interface DestroyVirtualMachineProps {
  client: FakeCloudStackClient;
  query: DestroyVirtualMachineQuery;
  signal?: AbortSignal | undefined;
}

export interface DestroyVirtualMachineResult { success: true }

export function destroyVirtualMachine(
  props: DestroyVirtualMachineProps,
): Promise<DestroyVirtualMachineResult> {
  return runAsyncSuccess(
    props.client,
    destroyVirtualMachineSpec.command,
    props.query,
    props.signal,
  );
}
