import { randomUUID } from "node:crypto";
import { OrchestratorStore } from "../database/store.js";
import type {
  DeploymentOrchestratorConfig,
  DeploymentStepRegistry,
  JobCaseDefinition,
  JobDefinition,
  JobDefinitionRecord,
  JobRunResult,
} from "../types.js";
import { buildApiJobGraph } from "./api-job-graph.js";
import { JobExecutor } from "./job-executor.js";
import { resolveJobCase } from "./job-definition.js";
import { Scheduler } from "./scheduler.js";
import { validateMaxTimeout } from "./timeout.js";

/** High-level facade for creating, executing, and inspecting deployment runs. */
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
      jobs.map((job) => {
        validateMaxTimeout(job.maxTimeout, `Job ${job.id} maxTimeout`);
        return {
          ...job,
          maxRetries: job.maxRetries ?? this.maxRetries,
          maxRollbackRetries: job.maxRollbackRetries ?? this.maxRollbackRetries,
        };
      }),
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

  /** Validates one persisted definition against the registered deployment-step DAG. */
  async validateJobDefinition(jobDefinitionId: string): Promise<JobDefinitionRecord> {
    if (this.deploymentSteps === undefined) {
      throw new Error("validateJobDefinition requires deploymentSteps");
    }
    const definition = await this.store.getJobDefinition(jobDefinitionId);
    buildApiJobGraph(definition.stepIds, this.deploymentSteps);
    return definition;
  }

  // skip kebutuhan unit testing
  async deployCase(
    deploymentCase: JobCaseDefinition,
    jobRunId: string = randomUUID(),
  ): Promise<JobRunResult> {
    const maxTimeout = caseMaxTimeout(deploymentCase);
    return this.runJobRun(
      await this.createJobRunFromCase(deploymentCase, jobRunId),
      maxTimeout,
    );
  }

  // skip kebutuhan unit testing
  async deploy(
    jobs: JobDefinition[],
    jobRunId: string = randomUUID(),
  ): Promise<JobRunResult> {
    return this.runJobRun(await this.createJobRun(jobs, jobRunId));
  }

  runJobRun(jobRunId: string, maxTimeout?: number): Promise<JobRunResult> {
    validateMaxTimeout(maxTimeout, "Run maxTimeout");
    return this.scheduler.run(jobRunId, maxTimeout);
  }

  resetDatabase(): Promise<void> {
    return this.store.resetJobRuns();
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

/** Returns the optional per-attempt timeout configured for a deployment case. */
export function caseMaxTimeout(deploymentCase: JobCaseDefinition): number | undefined {
  const maxTimeout = deploymentCase.defaults?.config?.maxTimeout;
  validateMaxTimeout(maxTimeout, "Case defaults.config.maxTimeout");
  return maxTimeout;
}
