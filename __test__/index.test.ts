import assert from "node:assert/strict";
import test from "node:test";
import * as core from "../src/index.js";
import { DeploymentOrchestrator } from "../src/core/index.js";
import { OrchestratorStore } from "../src/database/store.js";

test("core index exposes only the supported reusable boundary", () => {
  assert.equal(core.DeploymentOrchestrator, DeploymentOrchestrator);
  assert.equal(core.OrchestratorStore, OrchestratorStore);
  assert.equal(typeof core.resolveJobCase, "function");
  assert.equal(typeof core.sleep, "function");
  assert.equal("JobExecutor" in core, false);
  assert.equal("Scheduler" in core, false);
  assert.equal("RollbackManager" in core, false);
  assert.equal("listCloudDeploymentCases" in core, false);
  assert.equal("loadCloudDeploymentCase" in core, false);
});
