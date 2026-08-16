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
        filename: "01.success-without-public-ip.json",
        index: 1,
        description: "Success - Deploy VM tanpa public IP",
      },
      {
        filename: "02.success-with-public-ip.json",
        index: 2,
        description: "Success - Deploy VM dengan public IP",
      },
      {
        filename: "03.success-parallel-acl-rules.json",
        index: 3,
        description: "Success - Lima ACL rule berjalan paralel",
      },
      {
        filename: "04.success-after-two-timeouts-40s.json",
        index: 4,
        description: "Success - Dua kali timeout 40 detik, retry, lalu sukses",
      },
      {
        filename: "05.success-after-two-delays-40s.json",
        index: 5,
        description: "Success - Dua kali delay 40 detik, retry, lalu sukses",
      },
      {
        filename: "06.success-after-retry-jobstatus-2.json",
        index: 6,
        description: "Success - Jobstatus 2, retry, lalu sukses",
      },
      {
        filename: "07.rolled-back-after-timeouts.json",
        index: 7,
        description: "Rollback failed - Subnet terus timeout sampai retry habis",
      },
      {
        filename: "08.rolled-back-after-delays.json",
        index: 8,
        description: "Rollback failed - Subnet terus delay sampai retry habis",
      },
      {
        filename: "09.rolled-back-after-jobstatus-2.json",
        index: 9,
        description: "Rolled back - Subnet terus mendapat jobstatus 2 sampai retry habis",
      },
      {
        filename: "10.rolled-back-after-acl-rule-failure.json",
        index: 10,
        description: "Rolled back - Create ACL rule gagal tanpa public IP",
      },
      {
        filename: "11.rolled-back-after-static-nat-failure.json",
        index: 11,
        description: "Rolled back - Create static NAT gagal dengan public IP",
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
