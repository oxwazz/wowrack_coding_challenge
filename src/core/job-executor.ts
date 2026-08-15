import { OrchestratorStore } from "../database/store.js";
import type {
  HandlerRegistry,
  JobStepRunRecord,
  JsonValue,
} from "../types.js";
import { sleep } from "../utils.js";

export type JobExecutionOutcome =
  | { success: true }
  | { success: false; error: Error };

/** Executes and rolls back individual job steps with retry, timeout, and persistence. */
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
  ): Promise<JobExecutionOutcome> {
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
