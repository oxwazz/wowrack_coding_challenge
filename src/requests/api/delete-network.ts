import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const deleteNetworkCommand = "deleteNetwork" as const;

export type DeleteNetworkQuery = ApiControlQuery & Readonly<{ id: string }>;

export interface DeleteNetworkProps {
  client: FakeCloudStackClient;
  query: DeleteNetworkQuery;
  signal?: AbortSignal | undefined;
}

export interface DeleteNetworkResult { success: true }

export function deleteNetwork(props: DeleteNetworkProps): Promise<DeleteNetworkResult> {
  return runAsyncSuccess(props.client, deleteNetworkCommand, props.query, props.signal);
}
