import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec, AsyncJobPollingOptions } from "./shared.js";
import { runAsyncObject } from "./shared.js";

export const createNetworkAclListApi = {
  command: "createNetworkACLList",
  resultKey: "networkacllist",
} as const satisfies ApiOperationSpec;

export type CreateNetworkAclListQuery = ApiControlQuery & Readonly<{
  vpcid: string;
  name: string;
}>;

export interface CreateNetworkAclListProps extends AsyncJobPollingOptions {
  client: FakeCloudStackClient;
  query: CreateNetworkAclListQuery;
  signal?: AbortSignal | undefined;
}

export type CreateNetworkAclListResult = JsonObject & { id: string };

export async function createNetworkAclList(
  props: CreateNetworkAclListProps,
): Promise<CreateNetworkAclListResult> {
  const result = await runAsyncObject(
    props.client,
    createNetworkAclListApi.command,
    props.query,
    createNetworkAclListApi.resultKey,
    props.signal,
    props.asyncJobPollInterval,
  );
  return result as CreateNetworkAclListResult;
}
