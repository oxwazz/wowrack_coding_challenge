import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiJobSpec } from "./shared.js";
import { runAsyncObject } from "./shared.js";

export const createNetworkAclListCommand = "createNetworkACLList" as const;

export const createNetworkAclListSpec = {
  id: "acl-list",
  handler: "create_acl_list",
  dependsOn: ["vpc"],
} as const satisfies ApiJobSpec;

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
    createNetworkAclListCommand,
    props.query,
    "networkacllist",
    props.signal,
  );
  return result as CreateNetworkAclListResult;
}
