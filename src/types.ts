import type {
  JOB_RUN_STATUSES,
  JOB_STATUSES,
} from "./constants.js";
import type { DeploymentOrchestrator } from "./core/deployment-orchestrator.js";

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
  /** Number of rollback retries after the first rollback attempt. */
  maxRollbackRetries?: number;
  /** Timeout in milliseconds for each run or rollback attempt. */
  maxTimeout?: number;
  /** JSON-serializable handler input persisted with the job. */
  input?: JsonValue;
  /** Fake API behavior used by demo cases; kept separate from business input. */
  apiControl?: JsonValue;
}

export interface JobStepDefinition {
  id: string;
  /** Logical step key used to resolve its run/rollback implementation. */
  type: string;
  dependsOn: string[];
  execution: DeploymentStepExecution;
}

export interface StoredJobDefinition {
  id: string;
  name: string;
  /** Logical deployment step IDs selected for this template. */
  stepIds: string[];
}

export interface JobDefinitionRecord extends StoredJobDefinition {
  createdAt: string;
  updatedAt: string;
}

export interface JobCaseDefaults {
  apiControl?: JsonObject;
  config?: JobCaseDefaultsConfig;
  /** @deprecated Use `config.maxRetries`. */
  maxRetries?: number;
}

export interface JobCaseDefaultsConfig extends JobCaseConfig {}

export interface JobCaseConfig {
  /** Number of retries after the first attempt. */
  maxRetries?: number;
  /** Number of rollback retries after the first rollback attempt. */
  maxRollbackRetries?: number;
  /** Timeout in milliseconds for each run or rollback attempt. */
  maxTimeout?: number;
}

export interface JobCaseStepInstance {
  input?: JsonValue;
  apiControl?: JsonObject;
  config?: JobCaseConfig;
  /** @deprecated Use `config.maxRetries` in deployment case files. */
  maxRetries?: number;
}

export interface JobCaseStep extends JobCaseStepInstance {
  /** Named runtime instances expanded from one logical fan-out step. */
  instances?: Record<string, JobCaseStepInstance>;
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
  rollbackAttempt: number;
  maxRollbackRetries: number;
  input: JsonValue | null;
  apiControl?: JsonValue;
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
  apiControl?: JsonValue;
  dependencyResults: Readonly<Record<string, JsonValue | null>>;
  signal: AbortSignal;
  sleep: (milliseconds: number) => Promise<void>;
}

export interface JobRollbackContext {
  jobRunId: string;
  jobId: string;
  attempt: number;
  input: JsonValue | null;
  apiControl?: JsonValue;
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

export type DeploymentStepExecution = "single" | "fan-out-leaf";

/** One logical deployment step, including both DAG metadata and executable behavior. */
export interface DeploymentStep extends JobHandler {
  dependsOn: readonly string[];
  execution: DeploymentStepExecution;
}

export type DeploymentStepRegistry = Readonly<Record<string, DeploymentStep>>;

export interface OrchestratorOptions {
  /** One global safety timeout for every run or rollback attempt. */
  jobTimeoutMs?: number;
  /** Default retry count for jobs that do not define their own retry count. */
  maxRetries?: number;
  /** Default rollback retry count for jobs without an explicit value. */
  maxRollbackRetries?: number;
}

type DeploymentOrchestratorBaseConfig = OrchestratorOptions & {
  databasePath: string;
};

export type DeploymentOrchestratorConfig = DeploymentOrchestratorBaseConfig & (
  | {
    /** Generic handlers used with fully resolved programmatic job definitions. */
    handlers: HandlerRegistry;
    deploymentSteps?: never;
  }
  | {
    /** Combined metadata and handlers used to resolve persisted deployment templates. */
    deploymentSteps: DeploymentStepRegistry;
    handlers?: never;
  }
);

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
}
