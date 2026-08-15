import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiJobSpec } from "./shared.js";
import { runAsyncObject } from "./shared.js";

export const createVpcSpec = {
  id: "vpc",
  command: "createVpc",
  resultKey: "vpc",
  handler: "create_vpc",
  dependsOn: [],
} as const satisfies ApiJobSpec;

export type CreateVpcQuery = ApiControlQuery & Readonly<{
  cidr: string;
  name?: string | undefined;
}>;

export interface CreateVpcProps {
  client: FakeCloudStackClient;
  query: CreateVpcQuery;
  signal?: AbortSignal | undefined;
}

export type CreateVpcResult = JsonObject & { id: string };

export async function createVpc(props: CreateVpcProps): Promise<CreateVpcResult> {
  const result = await runAsyncObject(
    props.client,
    createVpcSpec.command,
    props.query,
    createVpcSpec.resultKey,
    props.signal,
  );
  return result as CreateVpcResult;
}
