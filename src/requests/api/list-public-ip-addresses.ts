import type { JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import { asObject, requiredArray } from "../client.js";
import type { ApiControlQuery, ApiOperationSpec } from "./shared.js";

export const listPublicIpAddressesApi = {
  command: "listPublicIpAddresses",
  resultKey: "publicipaddress",
} as const satisfies ApiOperationSpec;

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
    listPublicIpAddressesApi.command,
    props.query,
    props.signal,
  );
  return requiredArray(
    response,
    listPublicIpAddressesApi.resultKey,
    `${listPublicIpAddressesApi.command} response`,
  ).map((address, index) => (
    asObject(address, `publicipaddress[${index}]`) as PublicIpAddress
  ));
}
