import type { JobStepDefinition } from "../types.js";
import { API_JOB_SPECS } from "../requests/api/specs.js";
import type { ApiJobSpec } from "../requests/api/shared.js";

const apiSpecs: Readonly<Record<string, ApiJobSpec>> = API_JOB_SPECS;

/**
 * Builds a topologically ordered DAG from API IDs and the specs colocated with each API.
 * Unknown IDs, duplicate IDs, omitted dependencies, and cycles are rejected eagerly.
 */
export function buildApiJobGraph(
  apiIds: readonly string[],
  specs: Readonly<Record<string, ApiJobSpec>> = apiSpecs,
): JobStepDefinition[] {
  const selected = new Set<string>();
  for (const apiId of apiIds) {
    if (selected.has(apiId)) throw new Error(`Duplicate API ID in job definition: ${apiId}`);
    if (specs[apiId] === undefined) throw new Error(`Unknown API ID: ${apiId}`);
    selected.add(apiId);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: JobStepDefinition[] = [];

  const visit = (apiId: string): void => {
    if (visited.has(apiId)) return;
    if (visiting.has(apiId)) throw new Error(`API dependency cycle detected at: ${apiId}`);
    const spec = specs[apiId];
    if (spec === undefined) throw new Error(`Unknown API ID: ${apiId}`);
    visiting.add(apiId);
    for (const dependencyId of spec.dependsOn) {
      if (!selected.has(dependencyId)) {
        throw new Error(`API ${apiId} requires missing dependency: ${dependencyId}`);
      }
      visit(dependencyId);
    }
    visiting.delete(apiId);
    visited.add(apiId);
    ordered.push({
      id: spec.id,
      handler: spec.handler,
      dependsOn: [...spec.dependsOn],
    });
  };

  for (const apiId of apiIds) visit(apiId);
  return ordered;
}
