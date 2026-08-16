import assert from "node:assert/strict";
import test from "node:test";
import { resolveJobCase } from "../../src/core/job-definition.js";
import { FakeCloudStackClient } from "../../src/requests/client.js";
import { createDeploymentSteps } from "../../src/requests/deployment-steps.js";
import type { StoredJobDefinition } from "../../src/types.js";

const definition: StoredJobDefinition = {
  id: "deploy",
  name: "Deploy",
  stepIds: ["vpc", "subnet"],
};

const deploymentSteps = createDeploymentSteps(new FakeCloudStackClient({
  baseUrl: "https://definition.test/api",
}));

test("resolveJobCase builds deployment steps and applies case configuration", () => {
  const jobs = resolveJobCase(
    definition,
    {
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
    },
    deploymentSteps,
  );

  assert.deepEqual(jobs, [
    {
      id: "vpc",
      type: "vpc",
      dependsOn: [],
      input: { cidr: "10.0.0.0/16" },
      apiControl: { delay: 5, timeout: 30, result: 1 },
      maxRetries: 1,
    },
    {
      id: "subnet",
      type: "subnet",
      dependsOn: ["vpc"],
      apiControl: { delay: 0, timeout: 30, result: 1 },
      maxRetries: 0,
    },
  ]);
});

test("resolveJobCase expands named fan-out instances into independent runtime jobs", () => {
  const jobs = resolveJobCase(
    {
      id: "acl",
      name: "ACL",
      stepIds: ["vpc", "acl-list", "acl-rule"],
    },
    {
      jobId: "acl",
      defaults: { config: { maxRetries: 1 } },
      steps: {
        vpc: { input: { cidr: "10.0.0.0/16" } },
        "acl-list": { input: { name: "main" } },
        "acl-rule": {
          apiControl: { delay: 0 },
          instances: {
            ssh: {
              input: { protocol: "tcp", startPort: 22, endPort: 22 },
            },
            http: {
              input: { protocol: "tcp", startPort: 80, endPort: 80 },
              config: { maxRetries: 3 },
            },
          },
        },
      },
    },
    deploymentSteps,
  );

  assert.deepEqual(jobs.slice(-2), [
    {
      id: "acl-rule:ssh",
      type: "acl-rule",
      dependsOn: ["acl-list"],
      input: { protocol: "tcp", startPort: 22, endPort: 22 },
      apiControl: { delay: 0 },
      maxRetries: 1,
    },
    {
      id: "acl-rule:http",
      type: "acl-rule",
      dependsOn: ["acl-list"],
      input: { protocol: "tcp", startPort: 80, endPort: 80 },
      apiControl: { delay: 0 },
      maxRetries: 3,
    },
  ]);
});

test("resolveJobCase rejects instances on a single-execution step", () => {
  assert.throws(
    () => resolveJobCase(
      { id: "deploy", name: "Deploy", stepIds: ["vpc"] },
      {
        jobId: "deploy",
        steps: {
          vpc: { instances: { primary: { input: { cidr: "10.0.0.0/16" } } } },
        },
      },
      deploymentSteps,
    ),
    /does not support instances/,
  );
});
