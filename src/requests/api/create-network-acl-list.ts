import type { DeploymentStepSpec, JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec } from "./shared.js";
import { runAsyncObject } from "./shared.js";

export const createNetworkAclListApi = {
  command: "createNetworkACLList",
  resultKey: "networkacllist",
} as const satisfies ApiOperationSpec;

export const createNetworkAclListStep = {
  id: "acl-list",
  handler: "create_acl_list",
  dependsOn: ["vpc"],
} as const satisfies DeploymentStepSpec;

export type CreateNetworkAclListQuery = ApiControlQuery & Readonly<{
  vpcid: string;
  name: string;
}>;

export interface CreateNetworkAclListProps {
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
  );
  return result as CreateNetworkAclListResult;
}
