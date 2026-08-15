import type { ApiParameters, JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { AsyncApiCommand } from "./commands.js";
import { requiredObject } from "../client.js";

/** Declarative metadata used to build an executable job graph from API IDs. */
export interface ApiJobSpec {
  id: string;
  handler: string;
  dependsOn: readonly string[];
}

export type ApiControlQuery = ApiParameters & Readonly<{
  result?: number;
  delay?: number;
  timeout?: number;
}>;

/** Starts an asynchronous CloudStack command and returns its terminal result. */
export async function runAsync(
  client: FakeCloudStackClient,
  command: AsyncApiCommand,
  query: ApiParameters,
  signal?: AbortSignal,
): Promise<JsonObject> {
  const jobId = await client.startAsyncJob(command, query, signal);
  return client.waitForAsyncJob(jobId, signal);
}

/** Starts an asynchronous command and extracts a required object from the result. */
export async function runAsyncObject(
  client: FakeCloudStackClient,
  command: AsyncApiCommand,
  query: ApiParameters,
  resultKey: string,
  signal?: AbortSignal,
): Promise<JsonObject> {
  const result = await runAsync(client, command, query, signal);
  return requiredObject(result, resultKey, `${command} async result`);
}

/** Starts an asynchronous command and validates its success response. */
export async function runAsyncSuccess(
  client: FakeCloudStackClient,
  command: AsyncApiCommand,
  query: ApiParameters,
  signal?: AbortSignal,
): Promise<{ success: true }> {
  const result = await runAsync(client, command, query, signal);
  if (result.success !== true) {
    throw new Error(`${command} did not return success=true`);
  }
  return { success: true };
}
