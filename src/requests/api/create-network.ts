import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import { requiredObject } from "../client.js";
import type { ApiControlQuery, ApiJobSpec } from "./shared.js";

export const createNetworkSpec = {
  id: "subnet",
  command: "createNetwork",
  resultKey: "network",
  handler: "create_subnet",
  dependsOn: ["vpc"],
} as const satisfies ApiJobSpec;

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
    createNetworkSpec.command,
    props.query,
    props.signal,
  );
  return requiredObject(
    response,
    createNetworkSpec.resultKey,
    `${createNetworkSpec.command} response`,
  ) as CreateNetworkResult;
}
