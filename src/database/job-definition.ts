import type {
  JobCaseDefinition,
  JobDefinition,
  StoredJobDefinition,
} from "../types.js";

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
