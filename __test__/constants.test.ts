import assert from "node:assert/strict";
import test from "node:test";
import {
  CLI_DEFAULTS,
  cloudStackApiUrl,
  JOB_RUN_STATUSES,
  JOB_STATUSES,
} from "../src/constants.js";

test("exports stable CLI defaults and status values", () => {
  assert.deepEqual(CLI_DEFAULTS, {
    databaseFile: "src/database/__generated__/deployments.sqlite",
    casesDirectory: "src/interfaces/cli/cases",
  });
  assert(JOB_STATUSES.includes("ROLLBACK_SKIPPED"));
  assert(JOB_RUN_STATUSES.includes("ROLLBACK_FAILED"));
  assert.equal(
    (JOB_RUN_STATUSES as readonly string[]).includes("ROLLBACK_SKIPPED"),
    false,
  );
});

test("cloudStackApiUrl reads a non-empty configured endpoint", () => {
  const previous = process.env.CLOUDSTACK_API_URL;
  try {
    process.env.CLOUDSTACK_API_URL = "https://cloudstack.test/client/api";
    assert.equal(cloudStackApiUrl(), "https://cloudstack.test/client/api");

    for (const invalid of [undefined, "", "   "]) {
      if (invalid === undefined) delete process.env.CLOUDSTACK_API_URL;
      else process.env.CLOUDSTACK_API_URL = invalid;
      assert.throws(() => cloudStackApiUrl(), /CLOUDSTACK_API_URL belum diatur/);
    }
  } finally {
    if (previous === undefined) delete process.env.CLOUDSTACK_API_URL;
    else process.env.CLOUDSTACK_API_URL = previous;
  }
});
