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

const now = (): string => new Date().toISOString();
const json = (value: JsonValue | null): string | null =>
  value === null ? null : JSON.stringify(value);
const finalStatuses = new Set<JobStatus>([
  "SUCCESS", "FAILED", "ROLLED_BACK", "ROLLBACK_SKIPPED", "ROLLBACK_FAILED", "SKIPPED",
]);
const executionFinalStatuses = new Set<JobStatus>(["SUCCESS", "FAILED"]);
const rollbackFinalStatuses = new Set<JobStatus>([
  "ROLLED_BACK", "ROLLBACK_SKIPPED", "ROLLBACK_FAILED",
]);

function completedPhaseDuration(
  history: JobRunLogRecord[],
  startingStatus: JobStatus,
  finishingStatuses: ReadonlySet<JobStatus>,
): number {
  let startedAt: number | null = null;
  let duration = 0;
  for (const log of history) {
    if (log.status === startingStatus) {
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

  constructor(filename: string) {
    this.database = createDatabase(filename);
    this.ready = migrateToLatest(this.database);
  }

  async close(): Promise<void> {
    await this.ready;
    await this.database.destroy();
  }

  async getJobDefinition(jobDefinitionId: string): Promise<JobDefinitionRecord> {
    await this.ready;
    const row = await this.database.selectFrom("jobs").selectAll()
      .where("id", "=", jobDefinitionId).executeTakeFirst();
    if (row === undefined) throw new Error(`Job definition not found: ${jobDefinitionId}`);
    return {
      id: row.id,
      name: row.name,
      steps: row.definition.steps,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async createJobRun(
    jobRunId: string,
    jobs: JobDefinition[],
    jobDefinitionId?: string,
  ): Promise<void> {
    await this.ready;
    const timestamp = now();
    const snapshot = jobs.map((job) => ({ ...job, maxRetries: job.maxRetries ?? 0 }));
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

  async getJobRun(jobRunId: string): Promise<JobRunRecord> {
    await this.ready;
    const row = await this.database.selectFrom("jobRuns").selectAll()
      .where("id", "=", jobRunId).executeTakeFirst();
    if (row === undefined) throw new Error(`Job run not found: ${jobRunId}`);
    return toJobRun(row);
  }

  async listInterruptedJobRuns(): Promise<JobRunRecord[]> {
    await this.ready;
    const rows = await this.database.selectFrom("jobRuns").selectAll()
      .where("status", "in", ["RUNNING", "ROLLING_BACK"])
      .orderBy("createdAt").execute();
    return rows.map(toJobRun);
  }

  async resetJobRuns(): Promise<void> {
    await this.ready;
    await this.database.deleteFrom("jobRuns").execute();
  }

  async setJobRunStatus(
    jobRunId: string,
    status: JobRunStatus,
  ): Promise<void> {
    await this.ready;
    await this.database.updateTable("jobRuns").set({ status })
      .where("id", "=", jobRunId).execute();
  }

  async getJobDefinitions(jobRunId: string): Promise<JobDefinition[]> {
    await this.ready;
    const row = await this.database.selectFrom("jobRuns").select("jobsSnapshot")
      .where("id", "=", jobRunId).executeTakeFirst();
    if (row === undefined) throw new Error(`Job run not found: ${jobRunId}`);
    return row.jobsSnapshot;
  }

  async getJobStepRuns(jobRunId: string): Promise<JobStepRunRecord[]> {
    const [jobRun, jobs, logs] = await Promise.all([
      this.getJobRun(jobRunId),
      this.getJobDefinitions(jobRunId),
      this.getJobRunLogs(jobRunId),
    ]);
    const histories = new Map<string, JobRunLogRecord[]>();
    for (const log of logs) {
      const history = histories.get(log.jobId) ?? [];
      history.push(log);
      histories.set(log.jobId, history);
    }

    const runs = jobs.map((job): JobStepRunRecord => {
      const history = histories.get(job.id) ?? [];
      const latest = history.at(-1);
      if (latest === undefined) throw new Error(`Job log not found: ${jobRunId}/${job.id}`);
      const started = history.findLast((log) => log.status === "RUNNING");
      const rollbackStarted = history.findLast((log) => log.status === "ROLLING_BACK");
      return {
        jobRunId,
        jobId: job.id,
        type: job.type,
        status: latest.status,
        attempt: latest.attempt,
        maxRetries: job.maxRetries ?? 0,
        input: job.input ?? null,
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

  async getJobStepRun(jobRunId: string, jobId: string): Promise<JobStepRunRecord> {
    const job = (await this.getJobStepRuns(jobRunId)).find((candidate) => candidate.jobId === jobId);
    if (job === undefined) throw new Error(`Job not found: ${jobRunId}/${jobId}`);
    return job;
  }

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
    return Object.fromEntries(dependencies.map((dependencyId) => [
      dependencyId,
      runsById.get(dependencyId)?.result ?? null,
    ]));
  }

  async transitionJob(
    jobRunId: string,
    jobId: string,
    transition: JobTransition,
  ): Promise<JobStepRunRecord> {
    const current = await this.getJobStepRun(jobRunId, jobId);
    const has = (key: keyof JobTransition): boolean =>
      Object.prototype.hasOwnProperty.call(transition, key);
    await this.database.insertInto("jobRunLogs").values({
      jobRunId,
      jobId,
      status: transition.status,
      attempt: transition.attempt ?? current.attempt,
      result: json(has("result") ? transition.result ?? null : current.result),
      error: has("error")
        ? transition.error ?? null
        : ["RUNNING", "RETRYING"].includes(transition.status) ? null : current.error,
      createdAt: now(),
    }).execute();
    return this.getJobStepRun(jobRunId, jobId);
  }

  async getJobRunLogs(jobRunId: string, jobId?: string): Promise<JobRunLogRecord[]> {
    await this.ready;
    let query = this.database.selectFrom("jobRunLogs").selectAll()
      .where("jobRunId", "=", jobRunId);
    if (jobId !== undefined) query = query.where("jobId", "=", jobId);
    return query.orderBy("id").execute();
  }
}
