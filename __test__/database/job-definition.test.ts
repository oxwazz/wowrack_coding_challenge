import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApiJobGraph,
  resolveJobCase,
} from "../../src/database/job-definition.js";
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

test("buildApiJobGraph orders selected APIs from their declared dependencies", () => {
  assert.deepEqual(
    buildApiJobGraph(["vm", "attach-acl", "acl-rule", "acl-list", "subnet", "vpc"])
      .map(({ id, dependsOn }) => ({ id, dependsOn })),
    [
      { id: "vpc", dependsOn: [] },
      { id: "subnet", dependsOn: ["vpc"] },
      { id: "vm", dependsOn: ["subnet"] },
      { id: "acl-list", dependsOn: ["vpc"] },
      { id: "attach-acl", dependsOn: ["subnet", "acl-list"] },
      { id: "acl-rule", dependsOn: ["acl-list"] },
    ],
  );
});

test("buildApiJobGraph rejects invalid API selections", () => {
  assert.throws(() => buildApiJobGraph(["unknown"]), /Unknown API ID/);
  assert.throws(() => buildApiJobGraph(["vpc", "vpc"]), /Duplicate API ID/);
  assert.throws(() => buildApiJobGraph(["subnet"]), /requires missing dependency: vpc/);
  assert.throws(
    () => buildApiJobGraph(["a", "b"], {
      a: { id: "a", handler: "a", dependsOn: ["b"] },
      b: { id: "b", handler: "b", dependsOn: ["a"] },
    }),
    /dependency cycle/,
  );
});
