import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery } from "./shared.js";
import { runAsyncObject } from "./shared.js";

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
    "createVpc",
    props.query,
    "vpc",
    props.signal,
  );
  return result as CreateVpcResult;
}
