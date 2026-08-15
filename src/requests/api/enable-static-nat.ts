import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { ApiControlQuery, ApiJobSpec } from "./shared.js";

export const enableStaticNatSpec = {
  id: "static-nat",
  handler: "enable_static_nat",
  dependsOn: ["vm", "public-ip"],
} as const satisfies ApiJobSpec;

export type EnableStaticNatQuery = ApiControlQuery & Readonly<{
  networkid: string;
  ipaddressid: string;
  virtualmachineid: string;
}>;

export interface EnableStaticNatProps {
  client: FakeCloudStackClient;
  query: EnableStaticNatQuery;
  signal?: AbortSignal | undefined;
}

export type EnableStaticNatResult = JsonObject & { success: true };

export async function enableStaticNat(
  props: EnableStaticNatProps,
): Promise<EnableStaticNatResult> {
  const response = await props.client.request("enableStaticNat", props.query, props.signal);
  if (response.success !== true) {
    throw new Error("enableStaticNat did not return success=true");
  }
  return response as EnableStaticNatResult;
}
