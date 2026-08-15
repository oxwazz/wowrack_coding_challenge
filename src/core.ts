import { randomUUID } from "node:crypto";
import { resolveJobCase } from "./database/job-definition.js";
import { OrchestratorStore } from "./database/store.js";
import type {
  DeploymentOrchestratorConfig,
  JobRunRecord,
  JobRunResult,
  HandlerRegistry,
  JobCaseDefinition,
  JobDefinition,
  JobStepRunRecord,
  JobStatus,
  JsonValue,
} from "./types.js";
import { sleep } from "./utils.js";

type Outcome = { success: true } | { success: false; error: Error };
type RunningJob = Promise<{ jobId: string; outcome: Outcome }>;

export class JobExecutor {
  constructor(
    private readonly store: OrchestratorStore,
    private readonly handlers: HandlerRegistry,
    private readonly timeoutMs: number,
  ) {}

  async execute(
    jobRunId: string,
    jobId: string,
    cancellationSignal: AbortSignal,
  ): Promise<Outcome> {
    while (true) {
      const current = await this.store.getJobStepRun(jobRunId, jobId);
      const attempt = current.attempt + 1;
      const job = await this.store.transitionJob(jobRunId, jobId, {
        status: "RUNNING", attempt, error: null,
      });
      try {
        const result = await this.runAttempt(job, cancellationSignal);
        await this.store.transitionJob(jobRunId, jobId, {
          status: "SUCCESS", result, error: null,
        });
        return { success: true };
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        const cancelled = cancellationSignal.aborted;
        await this.store.transitionJob(jobRunId, jobId, {
          status: "FAILED",
          error: error.message,
        });
        if (cancelled || attempt > current.maxRetries) return { success: false, error };
        await this.store.transitionJob(jobRunId, jobId, {
          status: "RETRYING", error: null,
        });
      }
    }
  }

  async rollback(jobRunId: string, jobId: string): Promise<boolean> {
    const job = await this.store.getJobStepRun(jobRunId, jobId);
    const rollback = this.handlers[job.type]?.rollback;
    await this.store.transitionJob(jobRunId, jobId, {
      status: "ROLLING_BACK", error: null,
    });
    if (rollback === undefined) {
      await this.store.transitionJob(jobRunId, jobId, {
        status: "ROLLBACK_SKIPPED", error: null,
      });
      return true;
    }
    try {
      await this.withTimeout(jobId, new AbortController().signal, async (signal) => {
        await rollback({
          jobRunId, jobId, input: job.input, result: job.result, signal,
          sleep: (milliseconds) => sleep(milliseconds, signal),
        });
      });
      await this.store.transitionJob(jobRunId, jobId, {
        status: "ROLLED_BACK", error: null,
      });
      return true;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      await this.store.transitionJob(jobRunId, jobId, {
        status: "ROLLBACK_FAILED", error: error.message,
      });
      return false;
    }
  }

  private async runAttempt(job: JobStepRunRecord, signal: AbortSignal): Promise<JsonValue> {
    return this.withTimeout(job.jobId, signal, async (attemptSignal) =>
      this.handlers[job.type]!.run({
        jobRunId: job.jobRunId,
        jobId: job.jobId,
        attempt: job.attempt,
        input: job.input,
        dependencyResults: await this.store.getDependencyResults(job.jobRunId, job.jobId),
        signal: attemptSignal,
        sleep: (milliseconds) => sleep(milliseconds, attemptSignal),
      }));
  }

  private async withTimeout<T>(
    jobId: string,
    externalSignal: AbortSignal,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const signal = AbortSignal.any([externalSignal, controller.signal]);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`Job ${jobId} timed out after ${this.timeoutMs}ms`);
        error.name = "TimeoutError";
        controller.abort(error);
        reject(error);
      }, this.timeoutMs);
      timer.unref();
    });
    try {
      return await Promise.race([operation(signal), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

export class Scheduler {
  constructor(
    private readonly store: OrchestratorStore,
    private readonly executor: JobExecutor,
  ) {}

  async resume(jobRunId: string): Promise<JobRunResult> {
    const jobRun = await this.store.getJobRun(jobRunId);
    if (jobRun.status === "RUNNING") return this.run(jobRunId);
    if (jobRun.status === "ROLLING_BACK") {
      await rollbackSuccessfulJobs(this.store, this.executor, jobRunId);
      return {
        jobRun: await this.store.getJobRun(jobRunId),
        jobs: await this.store.getJobStepRuns(jobRunId),
      };
    }
    throw new Error(`Job run ${jobRunId} is not interrupted: ${jobRun.status}`);
  }

  async run(jobRunId: string): Promise<JobRunResult> {
    await this.store.setJobRunStatus(jobRunId, "RUNNING");
    const definitions = await this.store.getJobDefinitions(jobRunId);
    const jobs = await this.store.getJobStepRuns(jobRunId);
    const statuses = new Map(jobs.map((job) => [job.jobId, job.status]));
    const completed = new Set(
      jobs.filter(({ status }) => status === "SUCCESS").map(({ jobId }) => jobId),
    );
    const dependents = new Map(definitions.map((job) => [job.id, [] as string[]]));
    const remaining = new Map(definitions.map((job) => [
      job.id,
      job.dependsOn.filter((dependency) => !completed.has(dependency)).length,
    ]));
    for (const job of definitions) {
      for (const dependency of job.dependsOn) dependents.get(dependency)!.push(job.id);
    }
    const ready: string[] = [];
    const running = new Map<string, { controller: AbortController; result: RunningJob }>();
    let failedBy = jobs.find(({ status, attempt, maxRetries }) =>
      status === "FAILED" && attempt > maxRetries)?.jobId;

    const enqueue = async (jobId: string): Promise<void> => {
      await this.store.transitionJob(jobRunId, jobId, {
        status: "READY", error: null,
      });
      statuses.set(jobId, "READY");
      ready.push(jobId);
    };

    const stopAfterFailure = async (jobId: string): Promise<void> => {
      failedBy = jobId;
      await this.store.setJobRunStatus(jobRunId, "FAILED");
      for (const runningJob of running.values()) {
        runningJob.controller.abort(new Error(`Job run stopped after ${jobId} failed`));
      }
      ready.length = 0;
      for (const [pendingId, status] of statuses) {
        const staleRunning = status === "RUNNING" && !running.has(pendingId);
        if ((["PENDING", "READY", "RETRYING"] as JobStatus[]).includes(status) || staleRunning) {
          await this.store.transitionJob(jobRunId, pendingId, {
            status: "SKIPPED", error: `Blocked by failed job ${jobId}`,
          });
          statuses.set(pendingId, "SKIPPED");
        }
      }
    };

    if (failedBy === undefined) {
      for (const job of definitions) {
        if (statuses.get(job.id) !== "SUCCESS" && remaining.get(job.id) === 0) {
          await enqueue(job.id);
        }
      }
    } else {
      await stopAfterFailure(failedBy);
    }

    while (ready.length > 0 || running.size > 0) {
      while (failedBy === undefined && ready.length > 0) {
        const jobId = ready.shift()!;
        const controller = new AbortController();
        const result = this.executor.execute(jobRunId, jobId, controller.signal)
          .then((outcome) => ({ jobId, outcome }));
        running.set(jobId, { controller, result });
        statuses.set(jobId, "RUNNING");
      }
      if (running.size === 0) break;
      const { jobId, outcome } = await Promise.race(
        [...running.values()].map(({ result }) => result),
      );
      running.delete(jobId);
      statuses.set(jobId, outcome.success ? "SUCCESS" : "FAILED");

      if (outcome.success && failedBy === undefined) {
        for (const dependent of dependents.get(jobId)!) {
          const count = remaining.get(dependent)! - 1;
          remaining.set(dependent, count);
          if (count === 0) await enqueue(dependent);
        }
      } else if (!outcome.success && failedBy === undefined) {
        await stopAfterFailure(jobId);
      }
    }

    if (failedBy === undefined) {
      await this.store.setJobRunStatus(jobRunId, "SUCCESS");
    } else {
      await rollbackSuccessfulJobs(this.store, this.executor, jobRunId, definitions);
    }
    return {
      jobRun: await this.store.getJobRun(jobRunId),
      jobs: await this.store.getJobStepRuns(jobRunId),
    };
  }
}

export async function rollbackSuccessfulJobs(
  store: OrchestratorStore,
  executor: JobExecutor,
  jobRunId: string,
  definitions?: JobDefinition[],
): Promise<void> {
  await store.setJobRunStatus(jobRunId, "ROLLING_BACK");
  const ordered = definitions ?? await store.getJobDefinitions(jobRunId);
  const rollbackCandidates = new Set(
    (await store.getJobStepRuns(jobRunId))
      .filter(({ status }) =>
        (["SUCCESS", "ROLLING_BACK", "ROLLBACK_FAILED"] as JobStatus[]).includes(status))
      .map(({ jobId }) => jobId),
  );
  let failed = false;
  for (const job of [...ordered].reverse()) {
    if (rollbackCandidates.has(job.id) && !(await executor.rollback(jobRunId, job.id))) failed = true;
  }
  await store.setJobRunStatus(jobRunId, failed ? "ROLLBACK_FAILED" : "ROLLED_BACK");
}

export class DeploymentOrchestrator {
  readonly store: OrchestratorStore;
  private readonly scheduler: Scheduler;
  private readonly maxRetries: number;

  constructor(config: DeploymentOrchestratorConfig) {
    this.store = new OrchestratorStore(config.databasePath);
    this.maxRetries = config.maxRetries ?? 0;
    const executor = new JobExecutor(this.store, config.handlers, config.jobTimeoutMs ?? 30_000);
    this.scheduler = new Scheduler(this.store, executor);
  }

  async createJobRun(
    jobs: JobDefinition[],
    jobRunId: string = randomUUID(),
  ): Promise<string> {
    await this.store.createJobRun(
      jobRunId,
      jobs.map((job) => ({ ...job, maxRetries: job.maxRetries ?? this.maxRetries })),
    );
    return jobRunId;
  }
  async createJobRunFromCase(
    deploymentCase: JobCaseDefinition,
    jobRunId: string = randomUUID(),
  ): Promise<string> {
    const definition = await this.store.getJobDefinition(deploymentCase.jobId);
    await this.store.createJobRun(
      jobRunId,
      resolveJobCase(definition, deploymentCase)
        .map((job) => ({ ...job, maxRetries: job.maxRetries ?? this.maxRetries })),
      definition.id,
    );
    return jobRunId;
  }
  async deployCase(
    deploymentCase: JobCaseDefinition,
    jobRunId: string = randomUUID(),
  ): Promise<JobRunResult> {
    return this.runJobRun(
      await this.createJobRunFromCase(deploymentCase, jobRunId),
    );
  }
  async deploy(
    jobs: JobDefinition[],
    jobRunId: string = randomUUID(),
  ): Promise<JobRunResult> {
    return this.runJobRun(await this.createJobRun(jobs, jobRunId));
  }

  runJobRun(jobRunId: string): Promise<JobRunResult> {
    return this.scheduler.run(jobRunId);
  }

  resumeJobRun(jobRunId: string): Promise<JobRunResult> {
    return this.scheduler.resume(jobRunId);
  }

  listInterruptedJobRuns(): Promise<JobRunRecord[]> {
    return this.store.listInterruptedJobRuns();
  }

  resetDatabase(): Promise<void> {
    return this.store.resetJobRuns();
  }

  close(): Promise<void> {
    return this.store.close();
  }
}
