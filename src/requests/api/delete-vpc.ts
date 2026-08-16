import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec, AsyncJobPollingOptions } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const deleteVpcApi = {
  command: "deleteVpc",
} as const satisfies ApiOperationSpec;

export type DeleteVpcQuery = ApiControlQuery & Readonly<{ id: string }>;

export interface DeleteVpcProps extends AsyncJobPollingOptions {
  client: FakeCloudStackClient;
  query: DeleteVpcQuery;
  signal?: AbortSignal | undefined;
}

export interface DeleteVpcResult { success: true }

export function deleteVpc(props: DeleteVpcProps): Promise<DeleteVpcResult> {
  return runAsyncSuccess(
    props.client,
    deleteVpcApi.command,
    props.query,
    props.signal,
    props.asyncJobPollInterval,
  );
}
