import { randomUUID } from "node:crypto";
import { OrchestratorStore } from "../database/store.js";
import type {
  DeploymentOrchestratorConfig,
  JobCaseDefinition,
  JobDefinition,
  JobRunRecord,
  JobRunResult,
} from "../types.js";
import { JobExecutor } from "./job-executor.js";
import { resolveJobCase } from "./job-definition.js";
import { Scheduler } from "./scheduler.js";

/** High-level facade for creating, executing, resuming, and inspecting deployment runs. */
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
