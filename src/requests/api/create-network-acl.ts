import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec, AsyncJobPollingOptions } from "./shared.js";
import { runAsyncObject } from "./shared.js";

export const createNetworkAclApi = {
  command: "createNetworkACL",
  resultKey: "networkacl",
} as const satisfies ApiOperationSpec;

export type CreateNetworkAclQuery = ApiControlQuery & Readonly<{
  aclid: string;
  protocol: string;
  cidrlist?: string | undefined;
  action?: string | undefined;
  traffictype?: string | undefined;
  startport?: number | undefined;
  endport?: number | undefined;
}>;

export interface CreateNetworkAclProps extends AsyncJobPollingOptions {
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
    createNetworkAclApi.command,
    props.query,
    createNetworkAclApi.resultKey,
    props.signal,
    props.asyncJobPollInterval,
  );
  return result as CreateNetworkAclResult;
}
