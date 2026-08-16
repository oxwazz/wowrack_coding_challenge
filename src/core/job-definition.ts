import type {
  DeploymentStepRegistry,
  JobCaseDefinition,
  JobCaseStep,
  JobCaseStepInstance,
  JobDefinition,
  JobStepDefinition,
  StoredJobDefinition,
} from "../types.js";
import { buildApiJobGraph } from "./api-job-graph.js";

const instanceKeyPattern = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Resolves a stored job template into executable steps using case-specific configuration.
 * Case-level retry defaults are used only when a step does not provide its own value.
 *
 * @param definition - Persisted template containing only the selected deployment step IDs.
 * @param deploymentCase - Per-deployment inputs and retry overrides.
 * @param deploymentSteps - Combined metadata and behavior registry.
 * @returns Executable job definitions in topological order.
 */
export function resolveJobCase(
  definition: StoredJobDefinition,
  deploymentCase: JobCaseDefinition,
  deploymentSteps: DeploymentStepRegistry,
): JobDefinition[] {
  return buildApiJobGraph(definition.stepIds, deploymentSteps).flatMap((step) => {
    const configured = deploymentCase.steps[step.id] ?? {};
    if (configured.instances === undefined) {
      return [resolveStep(step, step.id, deploymentCase, configured)];
    }
    if (step.execution !== "fan-out-leaf") {
      throw new Error(`Deployment step ${step.id} does not support instances`);
    }
    if (configured.input !== undefined) {
      throw new Error(`Deployment step ${step.id} cannot define both input and instances`);
    }
    const instances = Object.entries(configured.instances);
    if (instances.length === 0) {
      throw new Error(`Deployment step ${step.id} must define at least one instance`);
    }
    return instances.map(([instanceKey, instance]) => {
      if (!instanceKeyPattern.test(instanceKey)) {
        throw new Error(
          `Invalid instance key for deployment step ${step.id}: ${instanceKey}`,
        );
      }
      return resolveStep(
        step,
        `${step.id}:${instanceKey}`,
        deploymentCase,
        configured,
        instance,
      );
    });
  });
}

/** Resolves configuration for one single step or one expanded fan-out instance. */
function resolveStep(
  step: JobStepDefinition,
  runtimeId: string,
  deploymentCase: JobCaseDefinition,
  configured: JobCaseStep,
  instance?: JobCaseStepInstance,
): JobDefinition {
  const maxRetries = instance?.config?.maxRetries
    ?? instance?.maxRetries
    ?? configured.config?.maxRetries
    ?? configured.maxRetries
    ?? deploymentCase.defaults?.config?.maxRetries
    ?? deploymentCase.defaults?.maxRetries;
  const maxRollbackRetries = instance?.config?.maxRollbackRetries
    ?? configured.config?.maxRollbackRetries
    ?? deploymentCase.defaults?.config?.maxRollbackRetries;
  const hasApiControl = deploymentCase.defaults?.apiControl !== undefined
    || configured.apiControl !== undefined
    || instance?.apiControl !== undefined;
  const apiControl = {
    ...deploymentCase.defaults?.apiControl,
    ...configured.apiControl,
    ...instance?.apiControl,
  };
  const input = instance === undefined ? configured.input : instance.input;
  return {
    id: runtimeId,
    type: step.type,
    dependsOn: [...step.dependsOn],
    ...(input === undefined ? {} : { input }),
    ...(hasApiControl ? { apiControl } : {}),
    ...(maxRetries === undefined ? {} : { maxRetries }),
    ...(maxRollbackRetries === undefined ? {} : { maxRollbackRetries }),
  };
}
