import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiRequestSpec } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const deleteVpcSpec = {
  command: "deleteVpc",
} as const satisfies ApiRequestSpec;

export type DeleteVpcQuery = ApiControlQuery & Readonly<{ id: string }>;

export interface DeleteVpcProps {
  client: FakeCloudStackClient;
  query: DeleteVpcQuery;
  signal?: AbortSignal | undefined;
}

export interface DeleteVpcResult { success: true }

export function deleteVpc(props: DeleteVpcProps): Promise<DeleteVpcResult> {
  return runAsyncSuccess(props.client, deleteVpcSpec.command, props.query, props.signal);
}
