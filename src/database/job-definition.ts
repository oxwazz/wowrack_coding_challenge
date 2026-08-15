import type {
  JobCaseDefinition,
  JobDefinition,
  StoredJobDefinition,
} from "../types.js";

/**
 * Resolves a stored job template into executable steps using case-specific configuration.
 * Case-level retry defaults are used only when a step does not provide its own value.
 *
 * @param definition - Persisted template containing step IDs, handlers, and dependencies.
 * @param deploymentCase - Per-deployment inputs and retry overrides.
 * @returns Executable job definitions in the same order as the stored template.
 *
 * @example
 * ```ts
 * const jobs = resolveJobCase(storedDefinition, {
 *   jobId: storedDefinition.id,
 *   defaults: { maxRetries: 2 },
 *   steps: { vm: { input: { templateId: "template-1" } } },
 * });
 * ```
 */
export function resolveJobCase(
  definition: StoredJobDefinition,
  deploymentCase: JobCaseDefinition,
): JobDefinition[] {
  return definition.steps.map((step) => {
    const configured = deploymentCase.steps[step.id] ?? {};
    const maxRetries = configured.maxRetries ?? deploymentCase.defaults?.maxRetries;
    return {
      id: step.id,
      type: step.handler,
      dependsOn: [...step.dependsOn],
      ...(configured.input === undefined ? {} : { input: configured.input }),
      ...(maxRetries === undefined ? {} : { maxRetries }),
    };
  });
}
