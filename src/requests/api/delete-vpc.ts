import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const deleteVpcCommand = "deleteVpc" as const;

export type DeleteVpcQuery = ApiControlQuery & Readonly<{ id: string }>;

export interface DeleteVpcProps {
  client: FakeCloudStackClient;
  query: DeleteVpcQuery;
  signal?: AbortSignal | undefined;
}

export interface DeleteVpcResult { success: true }

export function deleteVpc(props: DeleteVpcProps): Promise<DeleteVpcResult> {
  return runAsyncSuccess(props.client, deleteVpcCommand, props.query, props.signal);
}
