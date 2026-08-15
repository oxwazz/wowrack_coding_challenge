import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery } from "./shared.js";
import { runAsyncObject } from "./shared.js";

export type CreateNetworkAclQuery = ApiControlQuery & Readonly<{
  aclid: string;
  protocol: string;
  cidrlist?: string | undefined;
  action?: string | undefined;
  traffictype?: string | undefined;
  startport?: number | undefined;
  endport?: number | undefined;
}>;

export interface CreateNetworkAclProps {
  client: FakeCloudStackClient;
  query: CreateNetworkAclQuery;
  signal?: AbortSignal | undefined;
}

export type CreateNetworkAclResult = JsonObject & { id: string; aclid: string };

export async function createNetworkAcl(
  props: CreateNetworkAclProps,
): Promise<CreateNetworkAclResult> {
  const result = await runAsyncObject(
    props.client,
    "createNetworkACL",
    props.query,
    "networkacl",
    props.signal,
  );
  return result as CreateNetworkAclResult;
}
