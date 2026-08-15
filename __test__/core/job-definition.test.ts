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
    defaults: { maxRetries: 1 },
    steps: {
      vpc: { input: { cidr: "10.0.0.0/16" } },
      subnet: { maxRetries: 0 },
    },
  });

  assert.deepEqual(jobs, [
    {
      id: "vpc",
      type: "create_vpc",
      dependsOn: [],
      input: { cidr: "10.0.0.0/16" },
      maxRetries: 1,
    },
    {
      id: "subnet",
      type: "create_subnet",
      dependsOn: ["vpc"],
      maxRetries: 0,
    },
  ]);
});
