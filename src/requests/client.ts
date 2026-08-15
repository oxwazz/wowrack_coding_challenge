import { errorMessage } from "../utils.js";
import type {
  ApiParameters,
  AsyncJobResponse,
  DocumentedCommand,
  FakeCloudStackClientOptions,
  JsonObject,
  JsonValue,
} from "../types.js";

export class FakeCloudStackApiError extends Error {
  readonly command: DocumentedCommand;
  readonly errorCode: number | null;
  readonly cloudStackErrorCode: number | null;
  readonly responseBody: JsonValue;
  readonly asyncJobFailed: boolean;

  constructor(
    command: DocumentedCommand,
    message: string,
    responseBody: JsonValue,
    errorCode: number | null = null,
    cloudStackErrorCode: number | null = null,
    asyncJobFailed = false,
  ) {
    super(message);
    this.name = "FakeCloudStackApiError";
    this.command = command;
    this.errorCode = errorCode;
    this.cloudStackErrorCode = cloudStackErrorCode;
    this.responseBody = responseBody;
    this.asyncJobFailed = asyncJobFailed;
  }
}

export class FakeCloudStackClient {
  readonly baseUrl: string;

  constructor(options: FakeCloudStackClientOptions) {
    this.baseUrl = options.baseUrl;
  }

  async request(
    command: DocumentedCommand,
    parameters: ApiParameters = {},
    signal?: AbortSignal,
  ): Promise<JsonObject> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("command", command);
    for (const [name, value] of Object.entries(parameters)) {
      if (value !== undefined) {
        url.searchParams.set(name, String(value));
      }
    }

    let response: Response;
    try {
      const request: RequestInit = {
        method: "GET",
        headers: { accept: "application/json" },
      };
      if (signal !== undefined) {
        request.signal = signal;
      }
      response = await fetch(url, request);
    } catch (cause) {
      throw new FakeCloudStackApiError(
        command,
        `Request ${command} failed: ${errorMessage(cause)}`,
        null,
      );
    }

    const text = await response.text();
    let body: JsonValue;
    try {
      body = JSON.parse(text) as JsonValue;
    } catch {
      throw new FakeCloudStackApiError(
        command,
        `Request ${command} returned invalid JSON (HTTP ${response.status})`,
        text,
      );
    }

    if (!response.ok) {
      const apiError = readApiErrorBody(body);
      throw new FakeCloudStackApiError(
        command,
        apiError?.message ?? `Request ${command} failed with HTTP ${response.status}`,
        body,
        apiError?.errorCode ?? null,
        apiError?.cloudStackErrorCode ?? null,
      );
    }

    const envelope = responseEnvelope(body, command);
    const apiError = readApiError(envelope);
    if (apiError !== null) {
      throw new FakeCloudStackApiError(
        command,
        apiError.message,
        body,
        apiError.errorCode,
        apiError.cloudStackErrorCode,
      );
    }
    return envelope;
  }

  async startAsyncJob(
    command: Exclude<DocumentedCommand, "queryAsyncJobResult">,
    parameters: ApiParameters,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.request(command, parameters, signal);
    return requiredString(response, "jobid", `${command} response`);
  }

  async queryAsyncJob(jobId: string, signal?: AbortSignal): Promise<AsyncJobResponse> {
    const response = await this.request("queryAsyncJobResult", { jobid: jobId, sleep: 0, timeout: 0 }, signal);
    const rawStatus = requiredNumber(response, "jobstatus", "queryAsyncJobResult response");
    if (rawStatus !== 0 && rawStatus !== 1 && rawStatus !== 2) {
      throw new FakeCloudStackApiError(
        "queryAsyncJobResult",
        `Unknown async job status ${rawStatus}`,
        response,
      );
    }
    const jobResultValue = response.jobresult;
    const jobResult = jobResultValue === undefined || jobResultValue === null
      ? {}
      : asObject(jobResultValue, "queryAsyncJobResult jobresult");
    return { jobId, jobStatus: rawStatus, jobResult };
  }

  async waitForAsyncJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<JsonObject> {
    while (true) {
      const job = await this.queryAsyncJob(jobId, signal);
      if (job.jobStatus === 1) {
        return job.jobResult;
      }
      if (job.jobStatus === 2) {
        const failure = readApiError(job.jobResult);
        const message = failure?.message ?? stringValue(job.jobResult.errortext)
          ?? `Async job ${jobId} failed`;
        throw new FakeCloudStackApiError(
          "queryAsyncJobResult",
          message,
          job.jobResult,
          failure?.errorCode ?? null,
          failure?.cloudStackErrorCode ?? null,
          true,
        );
      }
    }
  }
}

function responseEnvelope(body: JsonValue, command: DocumentedCommand): JsonObject {
  const root = asObject(body, `${command} response`);
  const key = `${command.toLowerCase()}response`;
  const value = root[key];
  if (value === undefined) {
    throw new Error(`${command} response does not contain ${key}`);
  }
  return asObject(value, `${command} response envelope`);
}

export function asObject(value: JsonValue | undefined, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

export function requiredObject(object: JsonObject, key: string, label: string): JsonObject {
  return asObject(object[key], `${label}.${key}`);
}

export function requiredArray(object: JsonObject, key: string, label: string): JsonValue[] {
  const value = object[key];
  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be an array`);
  }
  return value;
}

export function requiredString(object: JsonObject, key: string, label: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value;
}

function requiredNumber(object: JsonObject, key: string, label: string): number {
  const value = object[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}.${key} must be a finite number`);
  }
  return value;
}

function stringValue(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function numberValue(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readApiError(object: JsonObject): {
  message: string;
  errorCode: number | null;
  cloudStackErrorCode: number | null;
} | null {
  const message = stringValue(object.errortext);
  const errorCode = numberValue(object.errorcode);
  const cloudStackErrorCode = numberValue(object.cserrorcode);
  if (message === null && errorCode === null && cloudStackErrorCode === null) {
    return null;
  }
  return {
    message: message ?? `CloudStack API error ${errorCode ?? cloudStackErrorCode ?? "unknown"}`,
    errorCode,
    cloudStackErrorCode,
  };
}

function readApiErrorBody(body: JsonValue): ReturnType<typeof readApiError> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const root = body;
  const first = Object.values(root)[0];
  const candidate = first !== null && typeof first === "object" && !Array.isArray(first)
    ? first
    : root;
  return readApiError(candidate);
}
