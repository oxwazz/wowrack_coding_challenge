import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiJobSpec } from "./shared.js";
import { runAsyncObject } from "./shared.js";

export const createNetworkAclCommand = "createNetworkACL" as const;

export const createNetworkAclSpec = {
  id: "acl-rule",
  handler: "create_acl_rule",
  dependsOn: ["acl-list"],
} as const satisfies ApiJobSpec;

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
    createNetworkAclCommand,
    props.query,
    "networkacl",
    props.signal,
  );
  return result as CreateNetworkAclResult;
}
