import assert from "node:assert/strict";
import test from "node:test";
import { resolveJobCase } from "../../src/database/job-definition.js";
import type { StoredJobDefinition } from "../../src/types.js";

const definition: StoredJobDefinition = {
  id: "deploy",
  name: "Deploy",
  steps: [
    { id: "vpc", handler: "create", dependsOn: [] },
    { id: "public-ip", handler: "create", dependsOn: ["vpc"], optional: true },
  ],
};

test("resolveJobCase includes every definition step and applies case configuration", () => {
  const jobs = resolveJobCase(definition, {
    jobId: "deploy",
    defaults: { maxRetries: 1 },
    steps: {
      vpc: { input: { cidr: "10.0.0.0/16" } },
      "public-ip": { maxRetries: 0 },
    },
  });

  assert.deepEqual(jobs, [
    {
      id: "vpc",
      type: "create",
      dependsOn: [],
      input: { cidr: "10.0.0.0/16" },
      maxRetries: 1,
    },
    {
      id: "public-ip",
      type: "create",
      dependsOn: ["vpc"],
      maxRetries: 0,
    },
  ]);
});
