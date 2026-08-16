import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec, AsyncJobPollingOptions } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const deleteNetworkApi = {
  command: "deleteNetwork",
} as const satisfies ApiOperationSpec;

export type DeleteNetworkQuery = ApiControlQuery & Readonly<{ id: string }>;

export interface DeleteNetworkProps extends AsyncJobPollingOptions {
  client: FakeCloudStackClient;
  query: DeleteNetworkQuery;
  signal?: AbortSignal | undefined;
}

export interface DeleteNetworkResult { success: true }

export function deleteNetwork(props: DeleteNetworkProps): Promise<DeleteNetworkResult> {
  return runAsyncSuccess(
    props.client,
    deleteNetworkApi.command,
    props.query,
    props.signal,
    props.asyncJobPollInterval,
  );
}
