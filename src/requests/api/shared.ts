import type { ApiParameters, JsonObject } from "../../types.js";
import type { FakeCloudStackClient } from "../client.js";
import type { AsyncApiCommand } from "./commands.js";
import { requiredObject } from "../client.js";

/** Metadata owned by one CloudStack API operation implementation. */
export interface ApiOperationSpec {
  command: string;
  resultKey?: string;
}

export type ApiControlQuery = ApiParameters & Readonly<{
  result?: number;
  delay?: number;
  timeout?: number;
}>;

export interface AsyncJobPollingOptions {
  asyncJobPollInterval?: number | undefined;
}

/** Starts an asynchronous CloudStack command and returns its terminal result. */
export async function runAsync(
  client: FakeCloudStackClient,
  command: AsyncApiCommand,
  query: ApiParameters,
  signal?: AbortSignal,
  asyncJobPollInterval?: number,
): Promise<JsonObject> {
  if (
    asyncJobPollInterval !== undefined
    && (!Number.isFinite(asyncJobPollInterval) || asyncJobPollInterval < 0)
  ) {
    throw new Error("asyncJobPollInterval must be a non-negative number in seconds");
  }
  const jobId = await client.startAsyncJob(command, query, signal);
  return client.waitForAsyncJob(jobId, signal, asyncJobPollInterval);
}

/** Starts an asynchronous command and extracts a required object from the result. */
export async function runAsyncObject(
  client: FakeCloudStackClient,
  command: AsyncApiCommand,
  query: ApiParameters,
  resultKey: string,
  signal?: AbortSignal,
  asyncJobPollInterval?: number,
): Promise<JsonObject> {
  const result = await runAsync(client, command, query, signal, asyncJobPollInterval);
  return requiredObject(result, resultKey, `${command} async result`);
}

/** Starts an asynchronous command and validates its success response. */
export async function runAsyncSuccess(
  client: FakeCloudStackClient,
  command: AsyncApiCommand,
  query: ApiParameters,
  signal?: AbortSignal,
  asyncJobPollInterval?: number,
): Promise<{ success: true }> {
  const result = await runAsync(client, command, query, signal, asyncJobPollInterval);
  if (result.success !== true) {
    throw new Error(`${command} did not return success=true`);
  }
  return { success: true };
}
