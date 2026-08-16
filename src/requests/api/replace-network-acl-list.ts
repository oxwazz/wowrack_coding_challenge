import type { DeploymentStepSpec } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec } from "./shared.js";
import { runAsyncSuccess } from "./shared.js";

export const replaceNetworkAclListApi = {
  command: "replaceNetworkACLList",
} as const satisfies ApiOperationSpec;

export const replaceNetworkAclListStep = {
  id: "attach-acl",
  handler: "attach_acl_list",
  dependsOn: ["subnet", "acl-list"],
} as const satisfies DeploymentStepSpec;

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
    replaceNetworkAclListApi.command,
    props.query,
    props.signal,
  );
}
