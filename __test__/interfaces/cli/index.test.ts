import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  formatElapsedSeconds,
  formatJobElapsed,
  formatJobTiming,
  jobStatusAppearance,
  listCloudDeploymentCases,
} from "../../../src/interfaces/cli/app.js";

test("loads deployment case labels and order from case files", async () => {
  assert.deepEqual(
    (await listCloudDeploymentCases(
      join(process.cwd(), "src", "interfaces", "cli", "cases"),
    ))
      .map(({ filename, index, description }) => ({ filename, index, description })),
    [
      {
        filename: "01.without-public-ip.json",
        index: 1,
        description: "Deploy VM tanpa public IP",
      },
      {
        filename: "02.with-public-ip.json",
        index: 2,
        description: "Deploy VM dengan public IP",
      },
      {
        filename: "03.parallel-acl-rules.json",
        index: 3,
        description: "Lima ACL rule berjalan paralel",
      },
      {
        filename: "04.failed-static-nat.json",
        index: 4,
        description: "Static NAT gagal; rollback VPC sukses setelah retry",
      },
      {
        filename: "05.failed-job.json",
        index: 5,
        description: "Job gagal, retry, lalu rollback",
      },
      {
        filename: "06.retry-jobstatus-2.json",
        index: 6,
        description: "Jobstatus 2, retry, lalu sukses",
      },
    ],
  );
});

test("maps final job states to distinct terminal indicators", () => {
  assert.deepEqual(jobStatusAppearance("SUCCESS"), { symbol: "✓", color: "green" });
  assert.deepEqual(jobStatusAppearance("FAILED"), { symbol: "✗", color: "red" });
  assert.deepEqual(jobStatusAppearance("ROLLED_BACK"), { symbol: "↩", color: "yellow" });
  assert.deepEqual(jobStatusAppearance("ROLLBACK_SKIPPED"), { symbol: "○", color: "yellow" });
});

test("formats total case runtime in seconds", () => {
  assert.equal(formatElapsedSeconds(0), "0.00 detik");
  assert.equal(formatElapsedSeconds(1_234), "1.23 detik");
  assert.equal(formatElapsedSeconds(12_345), "12.35 detik");
});

test("formats elapsed time for pending, running, and finished jobs", () => {
  assert.equal(formatJobElapsed({ startedAt: null, finishedAt: null }), "-");
  assert.equal(formatJobElapsed({
    startedAt: "2026-08-14T12:00:00.000Z",
    finishedAt: null,
  }, Date.parse("2026-08-14T12:00:01.234Z")), "1.23 detik");
  assert.equal(formatJobElapsed({
    startedAt: "2026-08-14T12:00:00.000Z",
    finishedAt: "2026-08-14T12:00:06.345Z",
  }), "6.35 detik");
});

test("formats active execution and rollback durations separately", () => {
  const base = {
    attempt: 2,
    startedAt: "2026-08-14T12:00:03.000Z",
    executionDurationMs: 6_070,
    rollbackStartedAt: null,
    rollbackDurationMs: 0,
  };
  assert.equal(formatJobTiming({ ...base, status: "FAILED" }), "eksekusi 6.07 detik");
  assert.equal(formatJobTiming({
    ...base,
    status: "ROLLED_BACK",
    rollbackStartedAt: "2026-08-14T12:00:10.000Z",
    rollbackDurationMs: 6_030,
  }), "eksekusi 6.07 detik · rollback 6.03 detik");
  assert.equal(formatJobTiming({
    ...base,
    status: "ROLLBACK_SKIPPED",
    rollbackStartedAt: "2026-08-14T12:00:10.000Z",
  }), "eksekusi 6.07 detik · rollback dilewati");
});
