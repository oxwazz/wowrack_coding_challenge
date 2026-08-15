import type {
  CLOUDSTACK_JOB_IDS,
  JOB_RUN_STATUSES,
  DOCUMENTED_COMMANDS,
  JOB_STATUSES,
} from "./constants.js";
import type { DeploymentOrchestrator } from "./core.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export interface JobDefinition {
  id: string;
  type: string;
  dependsOn: string[];
  /** Number of retries after the first attempt. */
  maxRetries?: number;
  /** JSON-serializable handler input persisted with the job. */
  input?: JsonValue;
}

export interface JobStepDefinition {
  id: string;
  /** Key used to resolve run/rollback functions from the handler registry. */
  handler: string;
  dependsOn: string[];
}

export interface StoredJobDefinition {
  id: string;
  name: string;
  /** API IDs selected for this template; graph metadata lives in each API file. */
  apiIds: string[];
}

export interface JobDefinitionRecord extends StoredJobDefinition {
  createdAt: string;
  updatedAt: string;
}

export interface JobCaseDefaults {
  maxRetries?: number;
}

export interface JobCaseStep {
  input?: JsonValue;
  maxRetries?: number;
}

export interface JobCaseDefinition {
  description?: string;
  jobId: string;
  defaults?: JobCaseDefaults;
  steps: Record<string, JobCaseStep>;
}

export interface JobStepRunRecord {
  jobRunId: string;
  jobId: string;
  type: string;
  status: JobStatus;
  attempt: number;
  maxRetries: number;
  input: JsonValue | null;
  result: JsonValue | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  executionDurationMs: number;
  rollbackStartedAt: string | null;
  rollbackDurationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunRecord {
  id: string;
  jobDefinitionId: string | null;
  status: JobRunStatus;
  createdAt: string;
}

export interface JobRunLogRecord {
  id: number;
  jobRunId: string;
  jobId: string;
  status: JobStatus;
  attempt: number;
  result: JsonValue | null;
  error: string | null;
  createdAt: string;
}

export interface JobRunContext {
  jobRunId: string;
  jobId: string;
  attempt: number;
  input: JsonValue | null;
  dependencyResults: Readonly<Record<string, JsonValue | null>>;
  signal: AbortSignal;
  sleep: (milliseconds: number) => Promise<void>;
}

export interface JobRollbackContext {
  jobRunId: string;
  jobId: string;
  input: JsonValue | null;
  result: JsonValue | null;
  signal: AbortSignal;
  sleep: (milliseconds: number) => Promise<void>;
}

export interface JobHandler {
  run: (context: JobRunContext) => Promise<JsonValue>;
  /** Omit when the documented API does not provide a rollback operation. */
  rollback?: (context: JobRollbackContext) => Promise<void>;
}

export type HandlerRegistry = Readonly<Record<string, JobHandler>>;

export interface OrchestratorOptions {
  /** One global safety timeout for every run or rollback attempt. */
  jobTimeoutMs?: number;
  /** Default retry count for jobs that do not define their own retry count. */
  maxRetries?: number;
}

export interface DeploymentOrchestratorConfig extends OrchestratorOptions {
  databasePath: string;
  handlers: HandlerRegistry;
}

export interface JobRunResult {
  jobRun: JobRunRecord;
  jobs: JobStepRunRecord[];
}

export interface JobTransition {
  status: JobStatus;
  attempt?: number;
  result?: JsonValue | null;
  error?: string | null;
}

export type CloudStackJobId =
  (typeof CLOUDSTACK_JOB_IDS)[keyof typeof CLOUDSTACK_JOB_IDS];
export type DocumentedCommand = (typeof DOCUMENTED_COMMANDS)[number];
export type ApiParameter = string | number | boolean | undefined;
export type ApiParameters = Readonly<Record<string, ApiParameter>>;

export interface FakeCloudStackClientOptions {
  baseUrl: string;
}

export type CloudDeploymentCase = JobCaseDefinition;

export interface InteractiveCliOptions {
  orchestrator: DeploymentOrchestrator;
  casesDirectory: string;
  databasePath: string;
  endpoint: string;
  maxRetries: number;
}
