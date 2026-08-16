import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const destroyVirtualMachineApi = {
  command: "destroyVirtualMachine",
} as const satisfies ApiOperationSpec;

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
    destroyVirtualMachineApi.command,
    props.query,
    props.signal,
  );
}
