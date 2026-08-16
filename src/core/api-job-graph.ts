import type { DeploymentStepSpec, JobStepDefinition } from "../types.js";
import { DEPLOYMENT_STEP_SPECS } from "../requests/api/deployment-steps.js";

const deploymentStepSpecs: Readonly<Record<string, DeploymentStepSpec>> =
  DEPLOYMENT_STEP_SPECS;

/**
 * Builds a topologically ordered DAG from deployment step IDs.
 * Unknown IDs, duplicate IDs, omitted dependencies, and cycles are rejected eagerly.
 */
export function buildApiJobGraph(
  stepIds: readonly string[],
  specs: Readonly<Record<string, DeploymentStepSpec>> = deploymentStepSpecs,
): JobStepDefinition[] {
  const selected = new Set<string>();
  for (const stepId of stepIds) {
    if (selected.has(stepId)) {
      throw new Error(`Duplicate deployment step ID in job definition: ${stepId}`);
    }
    if (specs[stepId] === undefined) {
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
    const spec = specs[stepId];
    if (spec === undefined) throw new Error(`Unknown deployment step ID: ${stepId}`);
    visiting.add(stepId);
    for (const dependencyId of spec.dependsOn) {
      if (!selected.has(dependencyId)) {
        throw new Error(
          `Deployment step ${stepId} requires missing dependency: ${dependencyId}`,
        );
      }
      visit(dependencyId);
    }
    visiting.delete(stepId);
    visited.add(stepId);
    ordered.push({
      id: spec.id,
      handler: spec.handler,
      dependsOn: [...spec.dependsOn],
    });
  };

  for (const stepId of stepIds) visit(stepId);
  return ordered;
}
