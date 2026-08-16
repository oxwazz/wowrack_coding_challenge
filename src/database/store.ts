import type { Kysely, Selectable } from "kysely";
import { createDatabase } from "./database.js";
import { migrateToLatest } from "./migrations.js";
import type { Database } from "./types.js";
import type {
  JobRunRecord,
  JobRunStatus,
  JobDefinition,
  JobDefinitionRecord,
  JobRunLogRecord,
  JobStepRunRecord,
  JobStatus,
  JobTransition,
  JsonValue,
} from "../types.js";

/** Returns the current time as an ISO-8601 timestamp for persisted records. */
const now = (): string => new Date().toISOString();
/** Serializes a JSON value for a nullable SQLite text column. */
const json = (value: JsonValue | null): string | null =>
  value === null ? null : JSON.stringify(value);
// Terminal status groups determine timestamps and completed phase durations.
const finalStatuses = new Set<JobStatus>([
  "SUCCESS", "FAILED", "ROLLED_BACK", "ROLLBACK_SKIPPED", "ROLLBACK_FAILED", "SKIPPED",
]);
const executionFinalStatuses = new Set<JobStatus>(["SUCCESS", "FAILED"]);
const rollbackFinalStatuses = new Set<JobStatus>([
  "ROLLED_BACK", "ROLLBACK_SKIPPED", "ROLLBACK_FAILED",
]);

/** Reads the current logical-step-ID array and tolerates the legacy object shape. */
function definitionStepIds(definition: unknown, jobDefinitionId: string): string[] {
  if (Array.isArray(definition) && definition.every((value) => typeof value === "string")) {
    return [...definition];
  }
  if (definition !== null && typeof definition === "object" && "steps" in definition) {
    const steps = definition.steps;
    if (Array.isArray(steps) && steps.every((step) => (
      step !== null && typeof step === "object" && "id" in step && typeof step.id === "string"
    ))) {
      return steps.map((step) => step.id);
    }
  }
  throw new Error(`Invalid job definition: ${jobDefinitionId}`);
}

/** Sums completed phase durations from matching start and finish log entries. */
function completedPhaseDuration(
  history: JobRunLogRecord[],
  startingStatus: JobStatus,
  finishingStatuses: ReadonlySet<JobStatus>,
): number {
  let startedAt: number | null = null;
  let duration = 0;
  for (const log of history) {
    if (log.status === startingStatus) {
      // A new phase start supersedes any unmatched start timestamp.
      startedAt = Date.parse(log.createdAt);
    } else if (startedAt !== null && finishingStatuses.has(log.status)) {
      const finishedAt = Date.parse(log.createdAt);
      if (Number.isFinite(startedAt) && Number.isFinite(finishedAt)) {
        duration += Math.max(0, finishedAt - startedAt);
      }
      startedAt = null;
    }
  }
  return duration;
}

/** Converts a selected database row into the public job-run record shape. */
function toJobRun(row: Selectable<Database["jobRuns"]>): JobRunRecord {
  return {
    id: row.id,
    jobDefinitionId: row.jobDefinitionId,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export class OrchestratorStore {
  readonly database: Kysely<Database>;
  readonly ready: Promise<void>;

  /**
   * Opens the SQLite store and starts applying pending migrations.
   * Await `ready` before using the raw `database` property directly.
   *
   * @param filename - SQLite filename, or `:memory:` for an isolated in-memory store.
   *
   * @example
   * ```ts
   * const store = new OrchestratorStore(":memory:");
   * await store.ready;
   * // Use the store...
   * await store.close();
   * ```
   */
  constructor(filename: string) {
    this.database = createDatabase(filename);
    this.ready = migrateToLatest(this.database);
  }

  /** Waits for initialization and closes the underlying database connection. */
  async close(): Promise<void> {
    await this.ready;
    await this.database.destroy();
  }

  /** Loads a reusable job definition by identifier. */
  async getJobDefinition(jobDefinitionId: string): Promise<JobDefinitionRecord> {
    await this.ready;
    const row = await this.database.selectFrom("jobs").selectAll()
      .where("id", "=", jobDefinitionId).executeTakeFirst();
    if (row === undefined) throw new Error(`Job definition not found: ${jobDefinitionId}`);
    return {
      id: row.id,
      name: row.name,
      stepIds: definitionStepIds(row.definition, row.id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Lists every reusable job definition in deterministic name order. */
  async listJobDefinitions(): Promise<JobDefinitionRecord[]> {
    await this.ready;
    const rows = await this.database.selectFrom("jobs").selectAll()
      .orderBy("name").orderBy("id").execute();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      stepIds: definitionStepIds(row.definition, row.id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Persists a new job run and an initial `PENDING` log for every step atomically.
   *
   * @param jobRunId - Unique identifier for the run.
   * @param jobs - DAG definition snapshotted with the run.
   * @param jobDefinitionId - Optional reusable template that produced the run.
   */
  async createJobRun(
    jobRunId: string,
    jobs: JobDefinition[],
    jobDefinitionId?: string,
  ): Promise<void> {
    await this.ready;
    const timestamp = now();
    // The snapshot makes an existing run independent from future template changes.
    const snapshot = jobs.map((job) => ({ ...job, maxRetries: job.maxRetries ?? 0 }));
    // The run and its initial step logs must either both exist or both be rolled back.
    await this.database.transaction().execute(async (transaction) => {
      await transaction.insertInto("jobRuns").values({
        id: jobRunId,
        jobDefinitionId: jobDefinitionId ?? null,
        jobsSnapshot: JSON.stringify(snapshot),
        status: "PENDING",
        createdAt: timestamp,
      }).execute();

      await transaction.insertInto("jobRunLogs").values(jobs.map((job) => ({
        jobRunId,
        jobId: job.id,
        status: "PENDING" as const,
        attempt: 0,
        result: null,
        error: null,
        createdAt: timestamp,
      }))).execute();
    });
  }

  /** Loads one persisted job-run record by identifier. */
  async getJobRun(jobRunId: string): Promise<JobRunRecord> {
    await this.ready;
    const row = await this.database.selectFrom("jobRuns").selectAll()
      .where("id", "=", jobRunId).executeTakeFirst();
    if (row === undefined) throw new Error(`Job run not found: ${jobRunId}`);
    return toJobRun(row);
  }

  /** Deletes all run history while leaving schema and job definitions intact. */
  async resetJobRuns(): Promise<void> {
    await this.ready;
    await this.database.deleteFrom("jobRuns").execute();
  }

  /** Updates the aggregate status of a persisted job run. */
  async setJobRunStatus(
    jobRunId: string,
    status: JobRunStatus,
  ): Promise<void> {
    await this.ready;
    await this.database.updateTable("jobRuns").set({ status })
      .where("id", "=", jobRunId).execute();
  }

  /** Returns the immutable job-definition snapshot stored with a run. */
  async getJobDefinitions(jobRunId: string): Promise<JobDefinition[]> {
    await this.ready;
    const row = await this.database.selectFrom("jobRuns").select("jobsSnapshot")
      .where("id", "=", jobRunId).executeTakeFirst();
    if (row === undefined) throw new Error(`Job run not found: ${jobRunId}`);
    return row.jobsSnapshot;
  }

  /**
   * Reconstructs the current state and timing of every step from its append-only logs.
   *
   * @param jobRunId - Identifier of the run to reconstruct.
   * @returns Step records in the original definition order.
   */
  async getJobStepRuns(jobRunId: string): Promise<JobStepRunRecord[]> {
    const [jobRun, jobs, logs] = await Promise.all([
      this.getJobRun(jobRunId),
      this.getJobDefinitions(jobRunId),
      this.getJobRunLogs(jobRunId),
    ]);
    const histories = new Map<string, JobRunLogRecord[]>();
    // Group ordered logs once so each job can be reconstructed independently below.
    for (const log of logs) {
      const history = histories.get(log.jobId) ?? [];
      history.push(log);
      histories.set(log.jobId, history);
    }

    const runs = jobs.map((job): JobStepRunRecord => {
      const history = histories.get(job.id) ?? [];
      const latest = history.at(-1);
      if (latest === undefined) throw new Error(`Job log not found: ${jobRunId}/${job.id}`);
      // The latest phase starts are used for live elapsed-time display after a restart.
      const started = history.findLast((log) => log.status === "RUNNING");
      const rollbackStarted = history.findLast((log) => log.status === "ROLLING_BACK");
      return {
        jobRunId,
        jobId: job.id,
        type: job.type,
        status: latest.status,
        attempt: latest.attempt,
        maxRetries: job.maxRetries ?? 0,
        rollbackAttempt: history.filter((log) => log.status === "ROLLING_BACK").length,
        maxRollbackRetries: job.maxRollbackRetries ?? 0,
        ...(job.asyncJobPollInterval === undefined
          ? {}
          : { asyncJobPollInterval: job.asyncJobPollInterval }),
        input: job.input ?? null,
        ...(job.apiControl === undefined ? {} : { apiControl: job.apiControl }),
        result: latest.result,
        error: latest.error,
        startedAt: started?.createdAt ?? null,
        finishedAt: finalStatuses.has(latest.status) ? latest.createdAt : null,
        executionDurationMs: completedPhaseDuration(
          history,
          "RUNNING",
          executionFinalStatuses,
        ),
        rollbackStartedAt: rollbackStarted?.createdAt ?? null,
        rollbackDurationMs: completedPhaseDuration(
          history,
          "ROLLING_BACK",
          rollbackFinalStatuses,
        ),
        createdAt: history[0]?.createdAt ?? jobRun.createdAt,
        updatedAt: latest.createdAt,
      };
    });

    return runs;
  }

  /** Returns the reconstructed state of a single step within a job run. */
  async getJobStepRun(jobRunId: string, jobId: string): Promise<JobStepRunRecord> {
    const job = (await this.getJobStepRuns(jobRunId)).find((candidate) => candidate.jobId === jobId);
    if (job === undefined) throw new Error(`Job not found: ${jobRunId}/${jobId}`);
    return job;
  }

  /** Collects the latest results of the direct dependencies required by a job step. */
  async getDependencyResults(
    jobRunId: string,
    jobId: string,
  ): Promise<Readonly<Record<string, JsonValue | null>>> {
    const [definitions, runs] = await Promise.all([
      this.getJobDefinitions(jobRunId),
      this.getJobStepRuns(jobRunId),
    ]);
    const dependencies = definitions.find((job) => job.id === jobId)?.dependsOn;
    if (dependencies === undefined) throw new Error(`Job not found: ${jobRunId}/${jobId}`);
    const runsById = new Map(runs.map((run) => [run.jobId, run]));
    // Missing results remain null so handlers receive every declared dependency key.
    return Object.fromEntries(dependencies.map((dependencyId) => [
      dependencyId,
      runsById.get(dependencyId)?.result ?? null,
    ]));
  }

  /**
   * Appends a state transition without mutating prior history.
   * Omitted result and error fields inherit their current values when appropriate.
   *
   * @param jobRunId - Identifier of the containing run.
   * @param jobId - Identifier of the step being transitioned.
   * @param transition - New status and optional attempt, result, or error values.
   * @returns The step state reconstructed after appending the transition.
   *
   * @example
   * ```ts
   * const job = await store.transitionJob("run-1", "vpc", {
   *   status: "SUCCESS",
   *   result: { id: "vpc-1" },
   * });
   * ```
   */
  async transitionJob(
    jobRunId: string,
    jobId: string,
    transition: JobTransition,
  ): Promise<JobStepRunRecord> {
    const current = await this.getJobStepRun(jobRunId, jobId);
    /** Checks whether the transition explicitly supplies an optional field. */
    const has = (key: keyof JobTransition): boolean =>
      Object.prototype.hasOwnProperty.call(transition, key);
    await this.database.insertInto("jobRunLogs").values({
      jobRunId,
      jobId,
      status: transition.status,
      attempt: transition.attempt ?? current.attempt,
      // Omitted fields inherit persisted values; explicitly supplied null clears them.
      result: json(has("result") ? transition.result ?? null : current.result),
      error: has("error")
        ? transition.error ?? null
        : ["RUNNING", "RETRYING"].includes(transition.status) ? null : current.error,
      createdAt: now(),
    }).execute();
    return this.getJobStepRun(jobRunId, jobId);
  }

  /** Returns ordered transition logs for a run, optionally filtered to one step. */
  async getJobRunLogs(jobRunId: string, jobId?: string): Promise<JobRunLogRecord[]> {
    await this.ready;
    let query = this.database.selectFrom("jobRunLogs").selectAll()
      .where("jobRunId", "=", jobRunId);
    if (jobId !== undefined) query = query.where("jobId", "=", jobId);
    return query.orderBy("id").execute();
  }
}
