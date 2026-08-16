import assert from "node:assert/strict";
import test from "node:test";
import { resolveJobCase } from "../../src/core/job-definition.js";
import type { StoredJobDefinition } from "../../src/types.js";

const definition: StoredJobDefinition = {
  id: "deploy",
  name: "Deploy",
  apiIds: ["vpc", "subnet"],
};

test("resolveJobCase builds steps from API specs and applies case configuration", () => {
  const jobs = resolveJobCase(definition, {
    jobId: "deploy",
    defaults: {
      apiControl: { delay: 0, timeout: 30, result: 1 },
      config: { maxRetries: 1 },
    },
    steps: {
      vpc: {
        input: { cidr: "10.0.0.0/16" },
        apiControl: { delay: 5 },
      },
      subnet: { config: { maxRetries: 0 } },
    },
  });

  assert.deepEqual(jobs, [
    {
      id: "vpc",
      type: "create_vpc",
      dependsOn: [],
      input: { cidr: "10.0.0.0/16" },
      apiControl: { delay: 5, timeout: 30, result: 1 },
      maxRetries: 1,
    },
    {
      id: "subnet",
      type: "create_subnet",
      dependsOn: ["vpc"],
      apiControl: { delay: 0, timeout: 30, result: 1 },
      maxRetries: 0,
    },
  ]);
});
