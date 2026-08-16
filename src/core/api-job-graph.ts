import type { DeploymentStepRegistry, JobStepDefinition } from "../types.js";

/**
 * Builds a topologically ordered DAG from deployment step IDs.
 * Unknown IDs, duplicate IDs, omitted dependencies, fan-out dependents, and cycles are rejected.
 *
 * @param stepIds - Logical step IDs selected by the stored template.
 * @param deploymentSteps - Combined metadata and behavior registry.
 */
export function buildApiJobGraph(
  stepIds: readonly string[],
  deploymentSteps: DeploymentStepRegistry,
): JobStepDefinition[] {
  const selected = new Set<string>();
  for (const stepId of stepIds) {
    if (selected.has(stepId)) {
      throw new Error(`Duplicate deployment step ID in job definition: ${stepId}`);
    }
    if (deploymentSteps[stepId] === undefined) {
      throw new Error(`Unknown deployment step ID: ${stepId}`);
    }
    selected.add(stepId);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: JobStepDefinition[] = [];

  const visit = (stepId: string): void => {
    if (visited.has(stepId)) return;
    if (visiting.has(stepId)) {
      throw new Error(`Deployment step dependency cycle detected at: ${stepId}`);
    }
    const step = deploymentSteps[stepId];
    if (step === undefined) throw new Error(`Unknown deployment step ID: ${stepId}`);
    visiting.add(stepId);
    for (const dependencyId of step.dependsOn) {
      if (!selected.has(dependencyId)) {
        throw new Error(
          `Deployment step ${stepId} requires missing dependency: ${dependencyId}`,
        );
      }
      if (deploymentSteps[dependencyId]?.execution === "fan-out-leaf") {
        throw new Error(
          `Deployment step ${stepId} cannot depend on fan-out leaf step: ${dependencyId}`,
        );
      }
      visit(dependencyId);
    }
    visiting.delete(stepId);
    visited.add(stepId);
    ordered.push({
      id: stepId,
      type: stepId,
      dependsOn: [...step.dependsOn],
      execution: step.execution,
    });
  };

  for (const stepId of stepIds) visit(stepId);
  return ordered;
}
