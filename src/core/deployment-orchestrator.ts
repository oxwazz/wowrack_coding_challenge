import { randomUUID } from "node:crypto";
import { OrchestratorStore } from "../database/store.js";
import type {
  DeploymentOrchestratorConfig,
  DeploymentStepRegistry,
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
  private readonly maxRollbackRetries: number;
  private readonly deploymentSteps: DeploymentStepRegistry | undefined;

  constructor(config: DeploymentOrchestratorConfig) {
    const handlers = config.deploymentSteps ?? config.handlers;
    if (handlers === undefined) {
      throw new Error("DeploymentOrchestrator requires handlers or deploymentSteps");
    }
    this.store = new OrchestratorStore(config.databasePath);
    this.maxRetries = config.maxRetries ?? 0;
    this.maxRollbackRetries = config.maxRollbackRetries ?? 0;
    this.deploymentSteps = config.deploymentSteps;
    const executor = new JobExecutor(this.store, handlers, config.jobTimeoutMs ?? 30_000);
    this.scheduler = new Scheduler(this.store, executor);
  }

  async createJobRun(
    jobs: JobDefinition[],
    jobRunId: string = randomUUID(),
  ): Promise<string> {
    await this.store.createJobRun(
      jobRunId,
      jobs.map((job) => ({
        ...job,
        maxRetries: job.maxRetries ?? this.maxRetries,
        maxRollbackRetries: job.maxRollbackRetries ?? this.maxRollbackRetries,
      })),
    );
    return jobRunId;
  }

  async createJobRunFromCase(
    deploymentCase: JobCaseDefinition,
    jobRunId: string = randomUUID(),
  ): Promise<string> {
    if (this.deploymentSteps === undefined) {
      throw new Error("createJobRunFromCase requires deploymentSteps");
    }
    const definition = await this.store.getJobDefinition(deploymentCase.jobId);
    await this.store.createJobRun(
      jobRunId,
      resolveJobCase(definition, deploymentCase, this.deploymentSteps)
        .map((job) => ({
          ...job,
          maxRetries: job.maxRetries ?? this.maxRetries,
          maxRollbackRetries: job.maxRollbackRetries ?? this.maxRollbackRetries,
        })),
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
