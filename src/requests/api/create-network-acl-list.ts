import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery } from "./shared.js";
import { runAsyncObject } from "./shared.js";

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
    "createNetworkACLList",
    props.query,
    "networkacllist",
    props.signal,
  );
  return result as CreateNetworkAclListResult;
}
