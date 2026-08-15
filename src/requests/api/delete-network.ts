import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiRequestSpec } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const deleteNetworkSpec = {
  command: "deleteNetwork",
} as const satisfies ApiRequestSpec;

export type DeleteNetworkQuery = ApiControlQuery & Readonly<{ id: string }>;

export interface DeleteNetworkProps {
  client: FakeCloudStackClient;
  query: DeleteNetworkQuery;
  signal?: AbortSignal | undefined;
}

export interface DeleteNetworkResult { success: true }

export function deleteNetwork(props: DeleteNetworkProps): Promise<DeleteNetworkResult> {
  return runAsyncSuccess(props.client, deleteNetworkSpec.command, props.query, props.signal);
}
