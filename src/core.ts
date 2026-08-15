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
  /** Creates an executor backed by persistent state, registered handlers, and a timeout. */
  constructor(
    private readonly store: OrchestratorStore,
    private readonly handlers: HandlerRegistry,
    private readonly timeoutMs: number,
  ) {}

  /** Runs a job step, persisting each attempt and retry until it succeeds or exhausts retries. */
  async execute(
    jobRunId: string,
    jobId: string,
    cancellationSignal: AbortSignal,
  ): Promise<Outcome> {
    while (true) {
      const current = await this.store.getJobStepRun(jobRunId, jobId);
      // Attempts are stored as a one-based counter, while PENDING starts at zero.
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
        // Cancellation is terminal even when the job still has retries available.
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

  /** Rolls back a completed job step and records whether cleanup succeeded. */
  async rollback(jobRunId: string, jobId: string): Promise<boolean> {
    const job = await this.store.getJobStepRun(jobRunId, jobId);
    const rollback = this.handlers[job.type]?.rollback;
    await this.store.transitionJob(jobRunId, jobId, {
      status: "ROLLING_BACK", error: null,
    });
    if (rollback === undefined) {
      // A missing rollback handler is an intentional no-op, not a rollback failure.
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

  /** Invokes the handler for one execution attempt with dependency results and cancellation. */
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

  /** Runs an asynchronous operation with both an external cancellation signal and a deadline. */
  private async withTimeout<T>(
    jobId: string,
    externalSignal: AbortSignal,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    // Handlers observe one signal that is aborted by either the scheduler or the deadline.
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
      // Racing rejects promptly even if a handler does not stop immediately after cancellation.
      return await Promise.race([operation(signal), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

export class Scheduler {
  /** Creates a scheduler using the supplied state store and job executor. */
  constructor(
    private readonly store: OrchestratorStore,
    private readonly executor: JobExecutor,
  ) {}

  /** Continues an interrupted execution or rollback from its persisted state. */
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

  /** Executes all ready DAG steps, stops on failure, and rolls back completed work as needed. */
  async run(jobRunId: string): Promise<JobRunResult> {
    await this.store.setJobRunStatus(jobRunId, "RUNNING");
    const definitions = await this.store.getJobDefinitions(jobRunId);
    const jobs = await this.store.getJobStepRuns(jobRunId);
    // These in-memory indexes avoid repeatedly reconstructing the DAG during scheduling.
    const statuses = new Map(jobs.map((job) => [job.jobId, job.status]));
    const completed = new Set(
      jobs.filter(({ status }) => status === "SUCCESS").map(({ jobId }) => jobId),
    );
    const dependents = new Map(definitions.map((job) => [job.id, [] as string[]]));
    // `remaining` counts only dependencies that were not completed in an earlier process.
    const remaining = new Map(definitions.map((job) => [
      job.id,
      job.dependsOn.filter((dependency) => !completed.has(dependency)).length,
    ]));
    for (const job of definitions) {
      for (const dependency of job.dependsOn) dependents.get(dependency)!.push(job.id);
    }
    const ready: string[] = [];
    const running = new Map<string, { controller: AbortController; result: RunningJob }>();
    // A persisted FAILED attempt is terminal only after its retry budget was exhausted.
    let failedBy = jobs.find(({ status, attempt, maxRetries }) =>
      status === "FAILED" && attempt > maxRetries)?.jobId;

    /** Marks a dependency-free job as ready and adds it to the local work queue. */
    const enqueue = async (jobId: string): Promise<void> => {
      await this.store.transitionJob(jobRunId, jobId, {
        status: "READY", error: null,
      });
      statuses.set(jobId, "READY");
      ready.push(jobId);
    };

    /** Cancels active work and marks all remaining jobs as skipped after a terminal failure. */
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
        // Completing one job may release several dependents at the same time.
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

/** Rolls back successful steps in reverse definition order and persists the final run status. */
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
  // Reversing topological definition order cleans up children before their dependencies.
  for (const job of [...ordered].reverse()) {
    if (rollbackCandidates.has(job.id) && !(await executor.rollback(jobRunId, job.id))) failed = true;
  }
  await store.setJobRunStatus(jobRunId, failed ? "ROLLBACK_FAILED" : "ROLLED_BACK");
}

export class DeploymentOrchestrator {
  readonly store: OrchestratorStore;
  private readonly scheduler: Scheduler;
  private readonly maxRetries: number;

  /**
   * Creates the high-level deployment facade and initializes its persistent scheduler.
   *
   * @param config - Database path, handler registry, timeout, and retry defaults.
   *
   * @example
   * ```ts
   * const orchestrator = new DeploymentOrchestrator({
   *   databasePath: "deployments.sqlite",
   *   handlers,
   *   jobTimeoutMs: 30_000,
   *   maxRetries: 1,
   * });
   * ```
   */
  constructor(config: DeploymentOrchestratorConfig) {
    this.store = new OrchestratorStore(config.databasePath);
    this.maxRetries = config.maxRetries ?? 0;
    const executor = new JobExecutor(this.store, config.handlers, config.jobTimeoutMs ?? 30_000);
    this.scheduler = new Scheduler(this.store, executor);
  }

  /**
   * Persists an explicit job graph without executing it.
   *
   * @param jobs - DAG steps to snapshot for this run.
   * @param jobRunId - Optional stable identifier; a UUID is generated when omitted.
   * @returns The identifier of the newly persisted run.
   *
   * @example
   * ```ts
   * const runId = await orchestrator.createJobRun([
   *   { id: "network", type: "create_network", dependsOn: [] },
   *   { id: "vm", type: "deploy_vm", dependsOn: ["network"] },
   * ]);
   * ```
   */
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

  /**
   * Resolves a deployment case against its stored template and persists the resulting run.
   *
   * @param deploymentCase - Template ID plus step inputs and retry overrides.
   * @param jobRunId - Optional stable identifier; a UUID is generated when omitted.
   * @returns The identifier of the newly persisted run.
   */
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

  /**
   * Creates and immediately executes a deployment run from a stored case definition.
   *
   * @param deploymentCase - Case configuration used to resolve the stored job template.
   * @param jobRunId - Optional run identifier.
   * @returns The final run record and reconstructed state of every step.
   *
   * @example
   * ```ts
   * const result = await orchestrator.deployCase({
   *   jobId: "deploy-vm-without-public-ip",
   *   steps: { vm: { input: { templateId: "template-1" } } },
   * });
   * console.log(result.jobRun.status);
   * ```
   */
  async deployCase(
    deploymentCase: JobCaseDefinition,
    jobRunId: string = randomUUID(),
  ): Promise<JobRunResult> {
    return this.runJobRun(
      await this.createJobRunFromCase(deploymentCase, jobRunId),
    );
  }

  /**
   * Creates and immediately executes a deployment run from an explicit job graph.
   *
   * @param jobs - DAG steps to persist and execute.
   * @param jobRunId - Optional run identifier.
   * @returns The final run record and reconstructed state of every step.
   */
  async deploy(
    jobs: JobDefinition[],
    jobRunId: string = randomUUID(),
  ): Promise<JobRunResult> {
    return this.runJobRun(await this.createJobRun(jobs, jobRunId));
  }

  /**
   * Executes a previously created job run.
   *
   * @param jobRunId - Identifier returned by `createJobRun` or `createJobRunFromCase`.
   * @returns The final run record and step states after execution or rollback.
   */
  runJobRun(jobRunId: string): Promise<JobRunResult> {
    return this.scheduler.run(jobRunId);
  }

  /**
   * Resumes a job run that was interrupted during execution or rollback.
   *
   * @param jobRunId - Identifier of a run currently marked `RUNNING` or `ROLLING_BACK`.
   * @returns The final run record and reconstructed step states.
   * @throws When the persisted run is not in an interruptible state.
   */
  resumeJobRun(jobRunId: string): Promise<JobRunResult> {
    return this.scheduler.resume(jobRunId);
  }

  /**
   * Lists persisted job runs that can be resumed.
   *
   * @returns Runs currently marked `RUNNING` or `ROLLING_BACK`, ordered by creation time.
   */
  listInterruptedJobRuns(): Promise<JobRunRecord[]> {
    return this.store.listInterruptedJobRuns();
  }

  /**
   * Deletes job-run history while preserving schema and reusable job definitions.
   *
   * @example
   * ```ts
   * await orchestrator.resetDatabase();
   * ```
   */
  resetDatabase(): Promise<void> {
    return this.store.resetJobRuns();
  }

  /**
   * Closes the underlying database connection after pending initialization completes.
   * Call this during application shutdown to release the SQLite file cleanly.
   */
  close(): Promise<void> {
    return this.store.close();
  }
}
