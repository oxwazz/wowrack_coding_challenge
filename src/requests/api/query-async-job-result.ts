import type { ApiParameters, JsonObject } from "../../types.js";
import { FakeCloudStackApiError, type FakeCloudStackClient } from "../client.js";
import { asObject } from "../client.js";

export const queryAsyncJobResultCommand = "queryAsyncJobResult" as const;

export type QueryAsyncJobResultQuery = ApiParameters & Readonly<{
  jobid: string;
  sleep?: number | undefined;
  timeout?: number | undefined;
}>;

export interface QueryAsyncJobResultProps {
  client: FakeCloudStackClient;
  query: QueryAsyncJobResultQuery;
  signal?: AbortSignal | undefined;
}

export interface QueryAsyncJobResult {
  jobId: string;
  jobStatus: 0 | 1 | 2;
  jobResult: JsonObject;
}

export async function queryAsyncJobResult(
  props: QueryAsyncJobResultProps,
): Promise<QueryAsyncJobResult> {
  const response = await props.client.request(
    queryAsyncJobResultCommand,
    props.query,
    props.signal,
  );
  const rawStatus = response.jobstatus;
  if (rawStatus !== 0 && rawStatus !== 1 && rawStatus !== 2) {
    throw new FakeCloudStackApiError(
      queryAsyncJobResultCommand,
      `Unknown async job status ${String(rawStatus)}`,
      response,
    );
  }
  const value = response.jobresult;
  const jobResult = value === undefined || value === null
    ? {}
    : asObject(value, "queryAsyncJobResult jobresult");
  return { jobId: props.query.jobid, jobStatus: rawStatus, jobResult };
}
