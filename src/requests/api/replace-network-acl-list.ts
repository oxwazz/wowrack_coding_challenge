import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiJobSpec } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const replaceNetworkAclListSpec = {
  id: "attach-acl",
  handler: "attach_acl_list",
  dependsOn: ["subnet", "acl-list"],
} as const satisfies ApiJobSpec;

export type ReplaceNetworkAclListQuery = ApiControlQuery & Readonly<{
  aclid: string;
  networkid: string;
}>;

export interface ReplaceNetworkAclListProps {
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
    "replaceNetworkACLList",
    props.query,
    props.signal,
  );
}
