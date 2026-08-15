import { errorMessage } from "../utils.js";
import type {
  ApiParameters,
  FakeCloudStackClientOptions,
  JsonObject,
  JsonValue,
} from "../types.js";
import type { ApiCommand, AsyncApiCommand } from "./api/commands.js";
import {
  queryAsyncJobResultCommand,
  queryAsyncJobResult,
  type QueryAsyncJobResult,
} from "./api/query-async-job-result.js";

export class FakeCloudStackApiError extends Error {
  readonly command: ApiCommand;
  readonly errorCode: number | null;
  readonly cloudStackErrorCode: number | null;
  readonly responseBody: JsonValue;
  readonly asyncJobFailed: boolean;

  /** Creates a structured error containing the failed command and CloudStack response details. */
  constructor(
    command: ApiCommand,
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

  /**
   * Creates a client that sends requests to the configured fake CloudStack endpoint.
   *
   * @param options - Client configuration containing the API base URL.
   *
   * @example
   * ```ts
   * const client = new FakeCloudStackClient({
   *   baseUrl: "http://localhost:8080/client/api",
   * });
   * ```
   */
  constructor(options: FakeCloudStackClientOptions) {
    this.baseUrl = options.baseUrl;
  }

  /**
   * Sends a CloudStack command and returns its validated response envelope.
   *
   * @param command - Supported CloudStack command name.
   * @param parameters - Query parameters sent with the command.
   * @param signal - Optional cancellation signal for the HTTP request.
   * @returns The object inside the command-specific response envelope.
   * @throws `FakeCloudStackApiError` for transport, HTTP, JSON, or API errors.
   *
   * @example
   * ```ts
   * const response = await client.request("listPublicIpAddresses", { state: "Free" });
   * ```
   */
  async request(
    command: ApiCommand,
    parameters: ApiParameters = {},
    signal?: AbortSignal,
  ): Promise<JsonObject> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("command", command);
    // Undefined values are omitted so CloudStack can apply its own parameter defaults.
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
      // Read text first so an invalid JSON response can be included in the thrown error.
      body = JSON.parse(text) as JsonValue;
    } catch {
      throw new FakeCloudStackApiError(
        command,
        `Request ${command} returned invalid JSON (HTTP ${response.status})`,
        text,
      );
    }

    if (!response.ok) {
      // Error payloads may be wrapped differently depending on the HTTP failure path.
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
    // Some fake API failures use HTTP 200 and place error fields inside the envelope.
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

  /**
   * Starts an asynchronous CloudStack command and returns its job identifier.
   *
   * @param command - Any supported command except `queryAsyncJobResult`.
   * @param parameters - Query parameters required by the command.
   * @param signal - Optional cancellation signal.
   * @returns The non-empty asynchronous job ID from the API response.
   */
  async startAsyncJob(
    command: AsyncApiCommand,
    parameters: ApiParameters,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.request(command, parameters, signal);
    return requiredString(response, "jobid", `${command} response`);
  }

  /**
   * Queries and validates the current status and result of an asynchronous job.
   *
   * @param jobId - ID returned by `startAsyncJob`.
   * @param signal - Optional cancellation signal.
   * @returns The normalized status (`0`, `1`, or `2`) and result object.
   */
  async queryAsyncJob(jobId: string, signal?: AbortSignal): Promise<QueryAsyncJobResult> {
    return queryAsyncJobResult({
      client: this,
      query: { jobid: jobId, sleep: 0, timeout: 0 },
      signal,
    });
  }

  /**
   * Polls an asynchronous job until it succeeds or reports a structured failure.
   *
   * @param jobId - ID returned by `startAsyncJob`.
   * @param signal - Optional cancellation signal used for each polling request.
   * @returns The asynchronous job's successful result object.
   * @throws `FakeCloudStackApiError` when CloudStack reports status `2`.
   *
   * @example
   * ```ts
   * const jobId = await client.startAsyncJob("createVpc", { cidr: "10.0.0.0/16" });
   * const result = await client.waitForAsyncJob(jobId);
   * ```
   */
  async waitForAsyncJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<JsonObject> {
    while (true) {
      const job = await this.queryAsyncJob(jobId, signal);
      // CloudStack uses 0 for pending, 1 for success, and 2 for failure.
      if (job.jobStatus === 1) {
        return job.jobResult;
      }
      if (job.jobStatus === 2) {
        const failure = readApiError(job.jobResult);
        const message = failure?.message ?? stringValue(job.jobResult.errortext)
          ?? `Async job ${jobId} failed`;
        throw new FakeCloudStackApiError(
          queryAsyncJobResultCommand,
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

/** Extracts the command-specific response envelope from a CloudStack response body. */
function responseEnvelope(body: JsonValue, command: ApiCommand): JsonObject {
  const root = asObject(body, `${command} response`);
  // CloudStack envelope keys are the lowercase command name followed by "response".
  const key = `${command.toLowerCase()}response`;
  const value = root[key];
  if (value === undefined) {
    throw new Error(`${command} response does not contain ${key}`);
  }
  return asObject(value, `${command} response envelope`);
}

/**
 * Validates that a JSON value is an object and returns its narrowed representation.
 *
 * @param value - JSON value to validate.
 * @param label - Human-readable path included in validation errors.
 * @returns The value narrowed to `JsonObject`.
 * @throws When the value is missing, null, an array, or a primitive.
 */
export function asObject(value: JsonValue | undefined, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

/** Reads a required nested object property with a contextual validation error. */
export function requiredObject(object: JsonObject, key: string, label: string): JsonObject {
  return asObject(object[key], `${label}.${key}`);
}

/** Reads a required array property with a contextual validation error. */
export function requiredArray(object: JsonObject, key: string, label: string): JsonValue[] {
  const value = object[key];
  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be an array`);
  }
  return value;
}

/** Reads a required non-empty string property with a contextual validation error. */
export function requiredString(object: JsonObject, key: string, label: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value;
}

/** Returns a non-empty string value or null when the value is absent or invalid. */
function stringValue(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Returns a finite numeric value or null when the value is absent or invalid. */
function numberValue(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Extracts normalized CloudStack error fields from a response object. */
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

/** Locates and extracts CloudStack error details from a complete response body. */
function readApiErrorBody(body: JsonValue): ReturnType<typeof readApiError> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const root = body;
  const first = Object.values(root)[0];
  // Prefer the first response envelope, but also support unwrapped error objects.
  const candidate = first !== null && typeof first === "object" && !Array.isArray(first)
    ? first
    : root;
  return readApiError(candidate);
}
