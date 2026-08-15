import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import { asObject, requiredArray } from "../client.js";
import type { ApiControlQuery, ApiJobSpec } from "./shared.js";

export const listPublicIpAddressesSpec = {
  id: "public-ip",
  command: "listPublicIpAddresses",
  resultKey: "publicipaddress",
  handler: "list_public_ip",
  dependsOn: [],
} as const satisfies ApiJobSpec;

export type ListPublicIpAddressesQuery = ApiControlQuery;

export interface ListPublicIpAddressesProps {
  client: FakeCloudStackClient;
  query: ListPublicIpAddressesQuery;
  signal?: AbortSignal | undefined;
}

export type PublicIpAddress = JsonObject & { id?: string; state?: string };
export type ListPublicIpAddressesResult = PublicIpAddress[];

export async function listPublicIpAddresses(
  props: ListPublicIpAddressesProps,
): Promise<ListPublicIpAddressesResult> {
  const response = await props.client.request(
    listPublicIpAddressesSpec.command,
    props.query,
    props.signal,
  );
  return requiredArray(
    response,
    listPublicIpAddressesSpec.resultKey,
    `${listPublicIpAddressesSpec.command} response`,
  ).map((address, index) => (
    asObject(address, `publicipaddress[${index}]`) as PublicIpAddress
  ));
}
