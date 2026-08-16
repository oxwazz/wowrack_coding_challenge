import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec, AsyncJobPollingOptions } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const replaceNetworkAclListApi = {
  command: "replaceNetworkACLList",
} as const satisfies ApiOperationSpec;

export type ReplaceNetworkAclListQuery = ApiControlQuery & Readonly<{
  aclid: string;
  networkid: string;
}>;

export interface ReplaceNetworkAclListProps extends AsyncJobPollingOptions {
  client: FakeCloudStackClient;
  query: ReplaceNetworkAclListQuery;
  signal?: AbortSignal | undefined;
}

export interface ReplaceNetworkAclListResult { success: true }

export function replaceNetworkAclList(
  props: ReplaceNetworkAclListProps,
): Promise<ReplaceNetworkAclListResult> {
  return runAsyncSuccess(
    props.client,
    replaceNetworkAclListApi.command,
    props.query,
    props.signal,
    props.asyncJobPollInterval,
  );
}
