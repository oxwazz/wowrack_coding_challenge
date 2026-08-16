import type {
  JobCaseDefinition,
  JobDefinition,
  StoredJobDefinition,
} from "../types.js";
import { buildApiJobGraph } from "./api-job-graph.js";

/**
 * Resolves a stored job template into executable steps using case-specific configuration.
 * Case-level retry defaults are used only when a step does not provide its own value.
 *
 * @param definition - Persisted template containing only the selected deployment step IDs.
 * @param deploymentCase - Per-deployment inputs and retry overrides.
 * @returns Executable job definitions in topological order.
 */
export function resolveJobCase(
  definition: StoredJobDefinition,
  deploymentCase: JobCaseDefinition,
): JobDefinition[] {
  return buildApiJobGraph(definition.apiIds).map((step) => {
    const configured = deploymentCase.steps[step.id] ?? {};
    const maxRetries = configured.config?.maxRetries
      ?? configured.maxRetries
      ?? deploymentCase.defaults?.config?.maxRetries
      ?? deploymentCase.defaults?.maxRetries;
    const hasApiControl = deploymentCase.defaults?.apiControl !== undefined
      || configured.apiControl !== undefined;
    const apiControl = {
      ...deploymentCase.defaults?.apiControl,
      ...configured.apiControl,
    };
    return {
      id: step.id,
      type: step.handler,
      dependsOn: [...step.dependsOn],
      ...(configured.input === undefined ? {} : { input: configured.input }),
      ...(hasApiControl ? { apiControl } : {}),
      ...(maxRetries === undefined ? {} : { maxRetries }),
    };
  });
}
