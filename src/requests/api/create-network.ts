import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import { requiredObject } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec } from "./shared.js";

export const createNetworkApi = {
  command: "createNetwork",
  resultKey: "network",
} as const satisfies ApiOperationSpec;

export type CreateNetworkQuery = ApiControlQuery & Readonly<{
  vpcid: string;
  name: string;
  gateway: string;
  netmask: string;
}>;

export interface CreateNetworkProps {
  client: FakeCloudStackClient;
  query: CreateNetworkQuery;
  signal?: AbortSignal | undefined;
}

export type CreateNetworkResult = JsonObject & { id: string };

export async function createNetwork(
  props: CreateNetworkProps,
): Promise<CreateNetworkResult> {
  const response = await props.client.request(
    createNetworkApi.command,
    props.query,
    props.signal,
  );
  return requiredObject(
    response,
    createNetworkApi.resultKey,
    `${createNetworkApi.command} response`,
  ) as CreateNetworkResult;
}
