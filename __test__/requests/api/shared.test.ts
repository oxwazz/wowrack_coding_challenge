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
