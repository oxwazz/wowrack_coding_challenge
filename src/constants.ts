export const CLI_DEFAULTS = {
  databaseFile: "src/database/__generated__/deployments.sqlite",
  casesDirectory: "src/interfaces/cli/cases",
  jobTimeoutMs: 30_000,
  maxRetries: 1,
  maxRollbackRetries: 0,
} as const;

/**
 * Returns the CloudStack endpoint configured through `CLOUDSTACK_API_URL`.
 *
 * @returns The non-empty URL stored in the environment variable.
 * @throws When `CLOUDSTACK_API_URL` is missing or contains only whitespace.
 *
 * @example
 * ```ts
 * process.env.CLOUDSTACK_API_URL = "http://localhost:8080/client/api";
 * const endpoint = cloudStackApiUrl();
 * ```
 */
export function cloudStackApiUrl(): string {
  const apiUrl = process.env.CLOUDSTACK_API_URL;
  if (apiUrl === undefined || apiUrl.trim() === "") {
    throw new Error(
      "CLOUDSTACK_API_URL belum diatur.",
    );
  }
  return apiUrl;
}

export const JOB_STATUSES = [
  "PENDING",
  "READY",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "RETRYING",
  "ROLLING_BACK",
  "ROLLED_BACK",
  "ROLLBACK_SKIPPED",
  "ROLLBACK_FAILED",
  "SKIPPED",
] as const;

export const JOB_RUN_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "ROLLING_BACK",
  "ROLLED_BACK",
  "ROLLBACK_FAILED",
] as const;
