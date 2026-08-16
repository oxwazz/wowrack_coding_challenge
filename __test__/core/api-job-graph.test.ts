import assert from "node:assert/strict";
import test from "node:test";
import { buildApiJobGraph } from "../../src/core/api-job-graph.js";
import { DEPLOYMENT_STEP_SPECS } from "../../src/requests/api/deployment-steps.js";

test("deployment step registry contains orchestration metadata only", () => {
  for (const step of Object.values(DEPLOYMENT_STEP_SPECS)) {
    assert.equal("command" in step, false);
    assert.equal("resultKey" in step, false);
  }
});

test("buildApiJobGraph orders selected steps from their declared dependencies", () => {
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

test("buildApiJobGraph rejects invalid step selections", () => {
  assert.throws(() => buildApiJobGraph(["unknown"]), /Unknown deployment step ID/);
  assert.throws(() => buildApiJobGraph(["vpc", "vpc"]), /Duplicate deployment step ID/);
  assert.throws(() => buildApiJobGraph(["subnet"]), /requires missing dependency: vpc/);
  assert.throws(
    () => buildApiJobGraph(["a", "b"], {
      a: { id: "a", handler: "a", dependsOn: ["b"] },
      b: { id: "b", handler: "b", dependsOn: ["a"] },
    }),
    /dependency cycle/,
  );
});
