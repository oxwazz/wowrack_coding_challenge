import assert from "node:assert/strict";
import test from "node:test";
import {
  DeploymentOrchestrator,
  type HandlerRegistry,
  type JobRunContext,
  type JsonValue,
} from "../src/index.js";
import {
  JobExecutor,
} from "../src/core/job-executor.js";
import { rollbackSuccessfulJobs } from "../src/core/rollback.js";
import { Scheduler } from "../src/core/scheduler.js";
import { OrchestratorStore } from "../src/database/store.js";

function inputObject(input: JsonValue | null): Record<string, JsonValue> {
  assert(input !== null && typeof input === "object" && !Array.isArray(input));
  return input;
}

test("advances all ready jobs immediately", async () => {
  const events: string[] = [];
  let active = 0;
  let peakActive = 0;
  const handlers: HandlerRegistry = {
    timed: {
      async run(context) {
        const duration = Number(inputObject(context.input).duration);
        events.push(`start:${context.jobId}`);
        active += 1;
        peakActive = Math.max(peakActive, active);
        await context.sleep(duration);
        active -= 1;
        events.push(`finish:${context.jobId}`);
        return { jobId: context.jobId };
      },
      async rollback() {},
    },
  };
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    handlers,
  });

  try {
    const result = await orchestrator.deploy([
      { id: "vpc", type: "timed", dependsOn: [], input: { duration: 10 } },
      { id: "subnet", type: "timed", dependsOn: ["vpc"], input: { duration: 80 } },
      { id: "acl-list", type: "timed", dependsOn: ["vpc"], input: { duration: 10 } },
      { id: "acl-rule", type: "timed", dependsOn: ["acl-list"], input: { duration: 10 } },
      {
        id: "vm",
        type: "timed",
        dependsOn: ["subnet", "acl-rule"],
        input: { duration: 5 },
      },
    ]);

    assert.equal(result.jobRun.status, "SUCCESS");
    assert.equal(peakActive, 2);
    assert(events.indexOf("start:acl-rule") < events.indexOf("finish:subnet"));
    assert(events.indexOf("start:vm") > events.indexOf("finish:subnet"));
    assert(events.indexOf("start:vm") > events.indexOf("finish:acl-rule"));
  } finally {
    await orchestrator.close();
  }
});

test("persists every retry attempt and ultimately succeeds", async () => {
  const seenAttempts: number[] = [];
  const handlers: HandlerRegistry = {
    flaky: {
      async run(context) {
        seenAttempts.push(context.attempt);
        if (context.attempt < 3) {
          throw new Error(`failure ${context.attempt}`);
        }
        return { attempt: context.attempt };
      },
      async rollback() {},
    },
  };
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    handlers,
  });

  try {
    const result = await orchestrator.deploy([
      { id: "flaky", type: "flaky", dependsOn: [], maxRetries: 2 },
    ]);
    assert.equal(result.jobRun.status, "SUCCESS");
    assert.deepEqual(seenAttempts, [1, 2, 3]);
    assert.equal(result.jobs[0]?.attempt, 3);
    assert.deepEqual(
      (await orchestrator.store
        .getJobRunLogs(result.jobRun.id, "flaky"))
        .map((log) => log.status),
      [
        "PENDING",
        "READY",
        "RUNNING",
        "FAILED",
        "RETRYING",
        "RUNNING",
        "FAILED",
        "RETRYING",
        "RUNNING",
        "SUCCESS",
      ],
    );
  } finally {
    await orchestrator.close();
  }
});

test("applies global retry count only when a job has no explicit retry count", async () => {
  const seenAttempts: Record<string, number[]> = {
    global: [],
    explicit: [],
  };
  const handlers: HandlerRegistry = {
    flaky: {
      async run(context) {
        seenAttempts[context.jobId]?.push(context.attempt);
        if (context.attempt < 2) {
          throw new Error(`failure ${context.attempt}`);
        }
        return { attempt: context.attempt };
      },
      async rollback() {},
    },
  };
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    handlers,
    maxRetries: 1,
  });

  try {
    const result = await orchestrator.deploy([
      { id: "global", type: "flaky", dependsOn: [] },
      { id: "explicit", type: "flaky", dependsOn: ["global"], maxRetries: 0 },
    ]);

    assert.equal(result.jobRun.status, "ROLLED_BACK");
    assert.deepEqual(seenAttempts.global, [1, 2]);
    assert.deepEqual(seenAttempts.explicit, [1]);
    assert.equal(result.jobs.find((job) => job.jobId === "global")?.maxRetries, 1);
    assert.equal(result.jobs.find((job) => job.jobId === "explicit")?.maxRetries, 0);
  } finally {
    await orchestrator.close();
  }
});

test("times out an attempt and records timeout history", async () => {
  const handlers: HandlerRegistry = {
    slow: {
      async run(context) {
        await context.sleep(100);
        return { completed: true };
      },
      async rollback() {},
    },
  };
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    handlers,
    jobTimeoutMs: 10,
  });

  try {
    const result = await orchestrator.deploy([
      { id: "slow", type: "slow", dependsOn: [] },
    ]);
    assert.equal(result.jobRun.status, "ROLLED_BACK");
    assert.equal(result.jobs[0]?.status, "FAILED");
    assert(
      (await orchestrator.store
        .getJobRunLogs(result.jobRun.id, "slow"))
        .some((log) => log.status === "FAILED" && log.error?.includes("timed out")),
    );
  } finally {
    await orchestrator.close();
  }
});

test("skips unstarted jobs and rolls successful work back in reverse DAG order", async () => {
  const rollbackEvents: string[] = [];
  const handler = {
    async run(context: JobRunContext): Promise<JsonValue> {
      const values = inputObject(context.input);
      await context.sleep(Number(values.duration ?? 0));
      if (values.fail === true) {
        throw new Error("intentional failure");
      }
      return { resourceId: context.jobId };
    },
    async rollback(context: { jobId: string }): Promise<void> {
      rollbackEvents.push(`start:${context.jobId}`);
      await new Promise((resolve) => setTimeout(resolve, 2));
      rollbackEvents.push(`finish:${context.jobId}`);
    },
  };
  const handlers: HandlerRegistry = { resource: handler };
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    handlers,
  });

  try {
    const result = await orchestrator.deploy([
      { id: "vpc", type: "resource", dependsOn: [], input: { duration: 1 } },
      { id: "subnet", type: "resource", dependsOn: ["vpc"], input: { duration: 2 } },
      { id: "acl-list", type: "resource", dependsOn: ["vpc"], input: { duration: 2 } },
      {
        id: "acl-rule",
        type: "resource",
        dependsOn: ["acl-list"],
        input: { duration: 15, fail: true },
      },
      { id: "vm", type: "resource", dependsOn: ["subnet", "acl-rule"] },
    ]);

    const states = Object.fromEntries(result.jobs.map((job) => [job.jobId, job.status]));
    assert.equal(result.jobRun.status, "ROLLED_BACK");
    assert.equal(states["acl-rule"], "FAILED");
    assert.equal(states.vm, "SKIPPED");
    assert.equal(states.vpc, "ROLLED_BACK");
    assert.equal(states.subnet, "ROLLED_BACK");
    assert.equal(states["acl-list"], "ROLLED_BACK");
    assert(
      rollbackEvents.indexOf("start:vpc") > rollbackEvents.indexOf("finish:subnet"),
    );
    assert(
      rollbackEvents.indexOf("start:vpc") > rollbackEvents.indexOf("finish:acl-list"),
    );
  } finally {
    await orchestrator.close();
  }
});

test("JobExecutor retries, persists the result, and rolls it back", async () => {
  const attempts: number[] = [];
  let rolledBackResult: JsonValue | null = null;
  const handlers: HandlerRegistry = {
    flaky: {
      async run(context) {
        attempts.push(context.attempt);
        if (context.attempt === 1) throw new Error("temporary failure");
        return { resourceId: "resource-1" };
      },
      async rollback(context) {
        rolledBackResult = context.result;
      },
    },
  };
  const store = new OrchestratorStore(":memory:");
  try {
    await store.createJobRun("executor-test", [
      { id: "resource", type: "flaky", dependsOn: [], maxRetries: 1 },
    ]);
    await store.transitionJob("executor-test", "resource", {
      status: "READY",
    });
    const executor = new JobExecutor(store, handlers, 1_000);
    const outcome = await executor.execute(
      "executor-test",
      "resource",
      new AbortController().signal,
    );
    assert.equal(outcome.success, true);
    assert.deepEqual(attempts, [1, 2]);
    assert.deepEqual(
      (await store.getJobStepRun("executor-test", "resource")).result,
      { resourceId: "resource-1" },
    );

    const rollback = await executor.rollback("executor-test", "resource");
    assert.equal(rollback, true);
    assert.deepEqual(rolledBackResult, { resourceId: "resource-1" });
    assert.deepEqual(
      (await store.getJobRunLogs("executor-test", "resource")).map(({ status }) => status),
      [
        "PENDING", "READY", "RUNNING", "FAILED", "RETRYING", "RUNNING",
        "SUCCESS", "ROLLING_BACK", "ROLLED_BACK",
      ],
    );
  } finally {
    await store.close();
  }
});

test("JobExecutor applies the one global timeout", async () => {
  const handlers: HandlerRegistry = {
    slow: {
      async run(context) {
        await context.sleep(100);
        return null;
      },
      async rollback() {},
    },
  };
  const store = new OrchestratorStore(":memory:");
  try {
    await store.createJobRun("timeout-test", [
      { id: "slow", type: "slow", dependsOn: [] },
    ]);
    await store.transitionJob("timeout-test", "slow", { status: "READY" });
    const executor = new JobExecutor(store, handlers, 5);
    const outcome = await executor.execute(
      "timeout-test",
      "slow",
      new AbortController().signal,
    );
    assert.equal(outcome.success, false);
    assert.equal((await store.getJobStepRun("timeout-test", "slow")).status, "FAILED");
    assert.match(
      (await store.getJobRunLogs("timeout-test", "slow")).at(-1)?.error ?? "",
      /timed out/,
    );
  } finally {
    await store.close();
  }
});

test("DeploymentOrchestrator is the facade for create and run", async () => {
  let runs = 0;
  const handlers: HandlerRegistry = {
    test: {
      async run() {
        runs += 1;
        return { id: "resource-1" };
      },
      async rollback() {},
    },
  };
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    handlers,
  });
  try {
    const result = await orchestrator.deploy([
      { id: "resource", type: "test", dependsOn: [] },
    ], "orchestrator-test");
    assert.equal(result.jobRun.status, "SUCCESS");
    assert.equal(runs, 1);
  } finally {
    await orchestrator.close();
  }
});

async function markSuccessful(
  store: OrchestratorStore,
  jobRunId: string,
  jobId: string,
  result: JsonValue = { id: jobId },
): Promise<void> {
  await store.transitionJob(jobRunId, jobId, { status: "READY" });
  await store.transitionJob(jobRunId, jobId, {
    status: "RUNNING",
    attempt: 1,
  });
  await store.transitionJob(jobRunId, jobId, {
    status: "SUCCESS",
    result,
  });
}

test("rollback runs successful jobs in reverse DAG order", async () => {
  const events: string[] = [];
  let active = 0;
  let peak = 0;
  const handlers: HandlerRegistry = {
    test: {
      async run() {
        return null;
      },
      async rollback(context) {
        events.push(`start:${context.jobId}`);
        active += 1;
        peak = Math.max(peak, active);
        await context.sleep(2);
        active -= 1;
        events.push(`finish:${context.jobId}`);
      },
    },
  };
  const store = new OrchestratorStore(":memory:");
  try {
    await store.createJobRun("rollback-test", [
      { id: "root", type: "test", dependsOn: [] },
      { id: "left", type: "test", dependsOn: ["root"] },
      { id: "right", type: "test", dependsOn: ["root"] },
    ]);
    await markSuccessful(store, "rollback-test", "root");
    await markSuccessful(store, "rollback-test", "left");
    await markSuccessful(store, "rollback-test", "right");
    await store.setJobRunStatus("rollback-test", "FAILED");

    const executor = new JobExecutor(store, handlers, 1_000);
    await rollbackSuccessfulJobs(store, executor, "rollback-test");

    assert.equal((await store.getJobRun("rollback-test")).status, "ROLLED_BACK");
    assert.equal(peak, 1);
    assert(events.indexOf("start:root") > events.indexOf("finish:left"));
    assert(events.indexOf("start:root") > events.indexOf("finish:right"));
    assert(
      (await store.getJobStepRuns("rollback-test")).every(
        ({ status }) => status === "ROLLED_BACK",
      ),
    );
  } finally {
    await store.close();
  }
});

test("rollback marks jobs without rollback APIs and continues to their parent", async () => {
  const events: string[] = [];
  const handlers: HandlerRegistry = {
    parent: {
      async run() { return null; },
      async rollback() { events.push("parent"); },
    },
    child: {
      async run() { return null; },
    },
  };
  const store = new OrchestratorStore(":memory:");
  try {
    await store.createJobRun("rollback-skipped-test", [
      { id: "parent", type: "parent", dependsOn: [] },
      { id: "child", type: "child", dependsOn: ["parent"] },
    ]);
    await markSuccessful(store, "rollback-skipped-test", "parent");
    await markSuccessful(store, "rollback-skipped-test", "child");
    await store.setJobRunStatus("rollback-skipped-test", "FAILED");

    const executor = new JobExecutor(store, handlers, 1_000);
    await rollbackSuccessfulJobs(store, executor, "rollback-skipped-test");

    const states = Object.fromEntries(
      (await store.getJobStepRuns("rollback-skipped-test")).map((job) => [job.jobId, job.status]),
    );
    assert.equal(states.child, "ROLLBACK_SKIPPED");
    assert.equal(states.parent, "ROLLED_BACK");
    assert.deepEqual(events, ["parent"]);
    assert.equal((await store.getJobRun("rollback-skipped-test")).status, "ROLLED_BACK");
  } finally {
    await store.close();
  }
});

test("rollback attempts parent cleanup after a child rollback failure", async () => {
  const events: string[] = [];
  const handlers: HandlerRegistry = {
    parent: {
      async run() { return null; },
      async rollback() { events.push("parent"); },
    },
    child: {
      async run() { return null; },
      async rollback() { throw new Error("child cleanup failed"); },
    },
  };
  const store = new OrchestratorStore(":memory:");
  try {
    await store.createJobRun("rollback-best-effort-test", [
      { id: "parent", type: "parent", dependsOn: [] },
      { id: "child", type: "child", dependsOn: ["parent"] },
    ]);
    await markSuccessful(store, "rollback-best-effort-test", "parent");
    await markSuccessful(store, "rollback-best-effort-test", "child");
    await store.setJobRunStatus("rollback-best-effort-test", "FAILED");

    const executor = new JobExecutor(store, handlers, 1_000);
    await rollbackSuccessfulJobs(store, executor, "rollback-best-effort-test");

    const states = Object.fromEntries(
      (await store.getJobStepRuns("rollback-best-effort-test")).map((job) => [job.jobId, job.status]),
    );
    assert.equal(states.child, "ROLLBACK_FAILED");
    assert.equal(states.parent, "ROLLED_BACK");
    assert.deepEqual(events, ["parent"]);
    assert.equal(
      (await store.getJobRun("rollback-best-effort-test")).status,
      "ROLLBACK_FAILED",
    );
  } finally {
    await store.close();
  }
});

test("Scheduler releases all ready dependents incrementally", async () => {
  const events: string[] = [];
  let active = 0;
  let peak = 0;
  const handlers: HandlerRegistry = {
    test: {
      async run(context) {
        events.push(`start:${context.jobId}`);
        active += 1;
        peak = Math.max(peak, active);
        await context.sleep(context.jobId === "left" ? 8 : 2);
        active -= 1;
        events.push(`finish:${context.jobId}`);
        return { id: context.jobId };
      },
      async rollback() {},
    },
  };
  const store = new OrchestratorStore(":memory:");
  try {
    await store.createJobRun("scheduler-test", [
      { id: "root", type: "test", dependsOn: [] },
      { id: "left", type: "test", dependsOn: ["root"] },
      { id: "right", type: "test", dependsOn: ["root"] },
      { id: "leaf", type: "test", dependsOn: ["left", "right"] },
    ]);
    const executor = new JobExecutor(store, handlers, 1_000);
    const scheduler = new Scheduler(store, executor);

    const result = await scheduler.run("scheduler-test");
    assert.equal(result.jobRun.status, "SUCCESS");
    assert.equal(peak, 2);
    assert(events.indexOf("start:right") < events.indexOf("finish:left"));
    assert(events.indexOf("start:leaf") > events.indexOf("finish:left"));
    assert(events.indexOf("start:leaf") > events.indexOf("finish:right"));
  } finally {
    await store.close();
  }
});

test("resumes an interrupted job run without repeating successful jobs", async () => {
  const executed: string[] = [];
  const handlers: HandlerRegistry = {
    test: {
      async run(context) {
        executed.push(context.jobId);
        return { id: context.jobId };
      },
      async rollback() {},
    },
  };
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    handlers,
  });
  try {
    await orchestrator.createJobRun([
      { id: "root", type: "test", dependsOn: [] },
      { id: "child", type: "test", dependsOn: ["root"] },
    ], "resume-test");
    await orchestrator.store.setJobRunStatus("resume-test", "RUNNING");
    await markSuccessful(orchestrator.store, "resume-test", "root");

    const result = await orchestrator.resumeJobRun("resume-test");

    assert.equal(result.jobRun.status, "SUCCESS");
    assert.deepEqual(executed, ["child"]);
    assert.deepEqual(
      Object.fromEntries(result.jobs.map((job) => [job.jobId, job.status])),
      { root: "SUCCESS", child: "SUCCESS" },
    );
  } finally {
    await orchestrator.close();
  }
});

test("resumes rollback that was interrupted", async () => {
  const rolledBack: string[] = [];
  const handlers: HandlerRegistry = {
    test: {
      async run() { return null; },
      async rollback(context) { rolledBack.push(context.jobId); },
    },
  };
  const orchestrator = new DeploymentOrchestrator({
    databasePath: ":memory:",
    handlers,
  });
  try {
    await orchestrator.createJobRun([
      { id: "root", type: "test", dependsOn: [] },
      { id: "child", type: "test", dependsOn: ["root"] },
    ], "resume-rollback-test");
    await markSuccessful(orchestrator.store, "resume-rollback-test", "root");
    await markSuccessful(orchestrator.store, "resume-rollback-test", "child");
    await orchestrator.store.setJobRunStatus("resume-rollback-test", "ROLLING_BACK");
    await orchestrator.store.transitionJob("resume-rollback-test", "child", {
      status: "ROLLING_BACK",
    });

    const result = await orchestrator.resumeJobRun("resume-rollback-test");

    assert.equal(result.jobRun.status, "ROLLED_BACK");
    assert.deepEqual(rolledBack, ["child", "root"]);
    assert(result.jobs.every(({ status }) => status === "ROLLED_BACK"));
  } finally {
    await orchestrator.close();
  }
});
