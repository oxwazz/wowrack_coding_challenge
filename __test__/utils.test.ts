import assert from "node:assert/strict";
import test from "node:test";
import { errorMessage, sleep } from "../src/utils.js";

test("errorMessage normalizes unknown errors", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage(42), "42");
});

test("sleep resolves normally and rejects promptly when aborted", async () => {
  await sleep(1);
  const controller = new AbortController();
  controller.abort(new Error("stop waiting"));
  await assert.rejects(
    () => sleep(1_000, controller.signal),
    (error: Error) => error.name === "AbortError",
  );
});
