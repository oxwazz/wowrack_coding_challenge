import type { OrchestratorStore } from "../database/store.js";
import type { JobRunResult, JobStatus } from "../types.js";
import type { JobExecutionOutcome, JobExecutor } from "./job-executor.js";
import { rollbackSuccessfulJobs } from "./rollback.js";

type RunningJob = Promise<{ jobId: string; outcome: JobExecutionOutcome }>;

/** Schedules all ready DAG nodes and coordinates failure cancellation and rollback. */
export class Scheduler {
  constructor(
    private readonly store: OrchestratorStore,
    private readonly executor: JobExecutor,
  ) {}

  async run(jobRunId: string): Promise<JobRunResult> {
    const jobRun = await this.store.getJobRun(jobRunId);
    if (jobRun.status !== "PENDING") {
      throw new Error(`Job run ${jobRunId} cannot be started: ${jobRun.status}`);
    }
    await this.store.setJobRunStatus(jobRunId, "RUNNING");
    const definitions = await this.store.getJobDefinitions(jobRunId);
    const jobs = await this.store.getJobStepRuns(jobRunId);
    const statuses = new Map(jobs.map((job) => [job.jobId, job.status]));
    const dependents = new Map(definitions.map((job) => [job.id, [] as string[]]));
    const remaining = new Map(definitions.map((job) => [
      job.id,
      job.dependsOn.length,
    ]));
    for (const job of definitions) {
      for (const dependency of job.dependsOn) dependents.get(dependency)!.push(job.id);
    }
    const ready: string[] = [];
    const running = new Map<string, { controller: AbortController; result: RunningJob }>();
    let failedBy: string | undefined;

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
        if ((["PENDING", "READY", "RETRYING"] as JobStatus[]).includes(status)) {
          await this.store.transitionJob(jobRunId, pendingId, {
            status: "SKIPPED", error: `Blocked by failed job ${jobId}`,
          });
          statuses.set(pendingId, "SKIPPED");
        }
      }
    };

    for (const job of definitions) {
      if (remaining.get(job.id) === 0) {
        await enqueue(job.id);
      }
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
