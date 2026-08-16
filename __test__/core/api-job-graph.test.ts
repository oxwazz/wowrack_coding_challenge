import assert from "node:assert/strict";
import test from "node:test";
import { buildApiJobGraph } from "../../src/core/api-job-graph.js";
import { FakeCloudStackClient } from "../../src/requests/client.js";
import { createDeploymentSteps } from "../../src/requests/deployment-steps.js";
import type { DeploymentStepRegistry } from "../../src/types.js";

const deploymentSteps = createDeploymentSteps(new FakeCloudStackClient({
  baseUrl: "https://definition.test/api",
}));
const run = async () => null;

test("deployment step registry combines orchestration metadata and behavior", () => {
  for (const step of Object.values(deploymentSteps)) {
    assert.equal("command" in step, false);
    assert.equal("resultKey" in step, false);
    assert.equal(typeof step.run, "function");
    assert(Array.isArray(step.dependsOn));
  }
});

test("buildApiJobGraph orders selected steps from their declared dependencies", () => {
  assert.deepEqual(
    buildApiJobGraph(
      ["vm", "attach-acl", "acl-rule", "acl-list", "subnet", "vpc"],
      deploymentSteps,
    )
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
  assert.throws(
    () => buildApiJobGraph(["unknown"], deploymentSteps),
    /Unknown deployment step ID/,
  );
  assert.throws(
    () => buildApiJobGraph(["vpc", "vpc"], deploymentSteps),
    /Duplicate deployment step ID/,
  );
  assert.throws(
    () => buildApiJobGraph(["subnet"], deploymentSteps),
    /requires missing dependency: vpc/,
  );
  const cyclicSteps = {
    a: { dependsOn: ["b"], execution: "single", run },
    b: { dependsOn: ["a"], execution: "single", run },
  } as const satisfies DeploymentStepRegistry;
  assert.throws(
    () => buildApiJobGraph(["a", "b"], cyclicSteps),
    /dependency cycle/,
  );
});

test("buildApiJobGraph rejects dependents of fan-out leaf steps", () => {
  const invalidSteps = {
    parent: { dependsOn: [], execution: "fan-out-leaf", run },
    child: { dependsOn: ["parent"], execution: "single", run },
  } as const satisfies DeploymentStepRegistry;

  assert.throws(
    () => buildApiJobGraph(["parent", "child"], invalidSteps),
    /cannot depend on fan-out leaf step: parent/,
  );
});
