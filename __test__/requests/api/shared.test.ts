import assert from "node:assert/strict";
import test from "node:test";
import type { FakeCloudStackClient } from "../../../src/requests/client.js";
import {
  runAsync,
  runAsyncObject,
  runAsyncSuccess,
} from "../../../src/requests/api/shared.js";

function clientWithResult(result: Record<string, unknown>): FakeCloudStackClient {
  return {
    async startAsyncJob() {
      return "job-1";
    },
    async waitForAsyncJob(jobId: string) {
      assert.equal(jobId, "job-1");
      return result;
    },
  } as unknown as FakeCloudStackClient;
}

test("runAsync starts a job and returns its terminal result", async () => {
  assert.deepEqual(
    await runAsync(clientWithResult({ id: "resource-1" }), "createVpc", {}),
    { id: "resource-1" },
  );
});

test("runAsync applies asyncJobPollInterval locally", async () => {
  let startedWith: Record<string, unknown> | undefined;
  let waitedWith: number | undefined;
  const client = {
    async startAsyncJob(_command: string, parameters: Record<string, unknown>) {
      startedWith = parameters;
      return "job-poll";
    },
    async waitForAsyncJob(_jobId: string, _signal: AbortSignal, interval: number) {
      waitedWith = interval;
      return { id: "resource-poll" };
    },
  } as unknown as FakeCloudStackClient;

  assert.deepEqual(
    await runAsync(client, "createVpc", { result: 1 }, undefined, 2),
    { id: "resource-poll" },
  );
  assert.deepEqual(startedWith, { result: 1 });
  assert.equal(waitedWith, 2);
});

test("runAsync rejects an invalid asyncJobPollInterval before starting a job", async () => {
  let started = false;
  const client = {
    async startAsyncJob() {
      started = true;
      return "job-invalid";
    },
  } as unknown as FakeCloudStackClient;

  await assert.rejects(
    () => runAsync(client, "createVpc", {}, undefined, -1),
    /asyncJobPollInterval must be a non-negative number in seconds/,
  );
  assert.equal(started, false);
});

test("runAsyncObject extracts the requested result object", async () => {
  assert.deepEqual(
    await runAsyncObject(
      clientWithResult({ vpc: { id: "vpc-1" } }),
      "createVpc",
      {},
      "vpc",
    ),
    { id: "vpc-1" },
  );
  await assert.rejects(
    () => runAsyncObject(clientWithResult({}), "createVpc", {}, "vpc"),
    /createVpc async result\.vpc must be a JSON object/,
  );
});

test("runAsyncSuccess requires an explicit success result", async () => {
  assert.deepEqual(
    await runAsyncSuccess(clientWithResult({ success: true }), "deleteVpc", {}),
    { success: true },
  );
  await assert.rejects(
    () => runAsyncSuccess(clientWithResult({ success: false }), "deleteVpc", {}),
    /deleteVpc did not return success=true/,
  );
});
