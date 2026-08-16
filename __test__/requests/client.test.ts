import assert from "node:assert/strict";
import test from "node:test";
import {
  asObject,
  FakeCloudStackApiError,
  FakeCloudStackClient,
  requiredArray,
  requiredObject,
  requiredString,
} from "../../src/requests/client.js";
import type { QueryAsyncJobResult } from "../../src/requests/api/query-async-job-result.js";

test("JSON response validators narrow valid values and reject invalid values", () => {
  const object = { nested: { id: "resource-1" }, items: [1], name: "value" };
  assert.equal(asObject(object, "body"), object);
  assert.deepEqual(requiredObject(object, "nested", "body"), { id: "resource-1" });
  assert.deepEqual(requiredArray(object, "items", "body"), [1]);
  assert.equal(requiredString(object, "name", "body"), "value");

  for (const value of [null, [], "text", 1]) {
    assert.throws(() => asObject(value, "body"), /body must be a JSON object/);
  }
  assert.throws(() => requiredObject(object, "missing", "body"), /body\.missing/);
  assert.throws(() => requiredArray(object, "missing", "body"), /must be an array/);
  assert.throws(() => requiredString({ name: "  " }, "name", "body"), /non-empty string/);
});

test("request sends defined query parameters and returns the command envelope", async (t) => {
  let requestedUrl: URL | undefined;
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    requestedUrl = new URL(String(input));
    return new Response(JSON.stringify({
      listpublicipaddressesresponse: { publicipaddress: [] },
    }));
  });
  const client = new FakeCloudStackClient({ baseUrl: "https://cloudstack.test/api" });

  assert.deepEqual(
    await client.request("listPublicIpAddresses", { state: "Free", ignored: undefined }),
    { publicipaddress: [] },
  );
  assert.equal(requestedUrl?.searchParams.get("command"), "listPublicIpAddresses");
  assert.equal(requestedUrl?.searchParams.get("state"), "Free");
  assert.equal(requestedUrl?.searchParams.has("ignored"), false);
});

test("request exposes invalid JSON, HTTP errors, and API-envelope errors", async (t) => {
  const client = new FakeCloudStackClient({ baseUrl: "https://cloudstack.test/api" });

  t.mock.method(globalThis, "fetch", async () => new Response("not-json"));
  await assert.rejects(
    () => client.request("listPublicIpAddresses"),
    (error: FakeCloudStackApiError) =>
      error.responseBody === "not-json" && /invalid JSON/.test(error.message),
  );

  globalThis.fetch = t.mock.fn(async () => new Response(JSON.stringify({
    errorresponse: { errortext: "denied", errorcode: 401, cserrorcode: 530 },
  }), { status: 401 }));
  await assert.rejects(
    () => client.request("listPublicIpAddresses"),
    (error: FakeCloudStackApiError) =>
      error.message === "denied"
      && error.errorCode === 401
      && error.cloudStackErrorCode === 530,
  );

  globalThis.fetch = t.mock.fn(async () => new Response(JSON.stringify({
    listpublicipaddressesresponse: { errortext: "API failed", errorcode: 500 },
  })));
  await assert.rejects(
    () => client.request("listPublicIpAddresses"),
    (error: FakeCloudStackApiError) => error.message === "API failed",
  );
});

test("waitForAsyncJob polls pending jobs and returns successful results", async (t) => {
  const client = new FakeCloudStackClient({ baseUrl: "https://cloudstack.test/api" });
  const responses: QueryAsyncJobResult[] = [
    { jobId: "job-1", jobStatus: 0, jobResult: {} },
    { jobId: "job-1", jobStatus: 1, jobResult: { id: "resource-1" } },
  ];
  const query = t.mock.method(client, "queryAsyncJob", async () => responses.shift()!);

  assert.deepEqual(await client.waitForAsyncJob("job-1"), { id: "resource-1" });
  assert.equal(query.mock.callCount(), 2);
});

test("waitForAsyncJob waits between pending job polls", async (t) => {
  const client = new FakeCloudStackClient({ baseUrl: "https://cloudstack.test/api" });
  const responses: QueryAsyncJobResult[] = [
    { jobId: "job-delay", jobStatus: 0, jobResult: {} },
    { jobId: "job-delay", jobStatus: 1, jobResult: { id: "resource-delay" } },
  ];
  const queriedAt: number[] = [];
  t.mock.method(client, "queryAsyncJob", async () => {
    queriedAt.push(performance.now());
    return responses.shift()!;
  });

  assert.deepEqual(
    await client.waitForAsyncJob("job-delay", undefined, 0.02),
    { id: "resource-delay" },
  );
  assert.equal(queriedAt.length, 2);
  assert.ok(queriedAt[1]! - queriedAt[0]! >= 15);
});

test("waitForAsyncJob validates the asynchronous poll interval", async () => {
  const client = new FakeCloudStackClient({ baseUrl: "https://cloudstack.test/api" });
  await assert.rejects(
    () => client.waitForAsyncJob("job-invalid", undefined, -1),
    /asyncJobPollInterval must be a non-negative number in seconds/,
  );
});

test("waitForAsyncJob throws a structured asynchronous failure", async (t) => {
  const client = new FakeCloudStackClient({ baseUrl: "https://cloudstack.test/api" });
  t.mock.method(client, "queryAsyncJob", async () => ({
    jobId: "job-2",
    jobStatus: 2,
    jobResult: { errortext: "async failed", errorcode: 530 },
  }));

  await assert.rejects(
    () => client.waitForAsyncJob("job-2"),
    (error: FakeCloudStackApiError) =>
      error.asyncJobFailed
      && error.message === "async failed"
      && error.errorCode === 530,
  );
});
