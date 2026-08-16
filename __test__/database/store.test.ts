import assert from "node:assert/strict";
import test from "node:test";
import { OrchestratorStore } from "../../src/database/store.js";

test("OrchestratorStore rebuilds state and dependencies from deployment logs", async () => {
  const store = new OrchestratorStore(":memory:");
  try {
    const storedDefinition = await store.getJobDefinition("deploy-vm-without-public-ip");
    assert.equal(storedDefinition.name, "Deploy VM tanpa Public IP");

    await store.createJobRun("store-test", [
      {
        id: "vpc",
        type: "test",
        dependsOn: [],
        input: { cidr: "10.0.0.0/16" },
        asyncJobPollInterval: 1,
      },
      { id: "vm", type: "test", dependsOn: ["vpc"], maxRetries: 2 },
    ]);
    assert.deepEqual(await store.getJobDefinitions("store-test"), [
      {
        id: "vpc",
        type: "test",
        dependsOn: [],
        maxRetries: 0,
        input: { cidr: "10.0.0.0/16" },
        asyncJobPollInterval: 1,
      },
      {
        id: "vm",
        type: "test",
        dependsOn: ["vpc"],
        maxRetries: 2,
      },
    ]);

    await store.setJobRunStatus("store-test", "RUNNING");
    await store.transitionJob("store-test", "vpc", { status: "READY" });
    await store.transitionJob("store-test", "vpc", {
      status: "RUNNING",
      attempt: 1,
    });
    await store.transitionJob("store-test", "vpc", {
      status: "SUCCESS",
      result: { resourceId: "vpc-1" },
    });

    assert.deepEqual(await store.getDependencyResults("store-test", "vm"), {
      vpc: { resourceId: "vpc-1" },
    });
    assert.deepEqual(
      (await store.getJobRunLogs("store-test", "vpc")).map(({ status }) => status),
      ["PENDING", "READY", "RUNNING", "SUCCESS"],
    );
  } finally {
    await store.close();
  }
});

test("resetJobRuns removes run history but preserves job definitions", async () => {
  const store = new OrchestratorStore(":memory:");
  try {
    await store.createJobRun("reset-test", [
      { id: "job", type: "test", dependsOn: [] },
    ]);

    await store.resetJobRuns();

    await assert.rejects(() => store.getJobRun("reset-test"));
    assert.equal((await store.getJobRunLogs("reset-test")).length, 0);
    assert.equal(
      (await store.getJobDefinition("deploy-vm-without-public-ip")).name,
      "Deploy VM tanpa Public IP",
    );
  } finally {
    await store.close();
  }
});
