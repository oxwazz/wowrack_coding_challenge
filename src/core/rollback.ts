import type { OrchestratorStore } from "../database/store.js";
import type { JobDefinition, JobStatus } from "../types.js";
import type { JobExecutor } from "./job-executor.js";
import { maxTimeoutToMilliseconds } from "./timeout.js";

/** Rolls back successful steps in reverse definition order and persists the final run status. */
export async function rollbackSuccessfulJobs(
  store: OrchestratorStore,
  executor: JobExecutor,
  jobRunId: string,
  definitions?: JobDefinition[],
  maxTimeout?: number,
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
    if (
      rollbackCandidates.has(job.id)
      && !(await executor.rollback(
        jobRunId,
        job.id,
        maxTimeoutToMilliseconds(job.maxTimeout ?? maxTimeout),
      ))
    ) {
      failed = true;
    }
  }
  await store.setJobRunStatus(jobRunId, failed ? "ROLLBACK_FAILED" : "ROLLED_BACK");
}
