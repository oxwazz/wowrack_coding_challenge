import type { DeploymentStepSpec, JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec } from "./shared.js";
import { runAsyncObject } from "./shared.js";

export const createVpcApi = {
  command: "createVpc",
  resultKey: "vpc",
} as const satisfies ApiOperationSpec;

export const createVpcStep = {
  id: "vpc",
  handler: "create_vpc",
  dependsOn: [],
} as const satisfies DeploymentStepSpec;

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
    createVpcApi.command,
    props.query,
    createVpcApi.resultKey,
    props.signal,
  );
  return result as CreateVpcResult;
}
