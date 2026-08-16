import assert from "node:assert/strict";
import test from "node:test";
import {
  maxTimeoutToMilliseconds,
  validateMaxTimeout,
} from "../../src/core/timeout.js";

test("validateMaxTimeout accepts omitted, zero, and finite positive values", () => {
  assert.doesNotThrow(() => validateMaxTimeout(undefined, "Timeout"));
  assert.doesNotThrow(() => validateMaxTimeout(0, "Timeout"));
  assert.doesNotThrow(() => validateMaxTimeout(0.5, "Timeout"));
});

test("validateMaxTimeout rejects negative and non-finite values with its label", () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => validateMaxTimeout(value, "Case timeout"),
      /Case timeout must be a non-negative number in seconds/,
    );
  }
});

test("maxTimeoutToMilliseconds converts seconds while preserving omission", () => {
  assert.equal(maxTimeoutToMilliseconds(undefined), undefined);
  assert.equal(maxTimeoutToMilliseconds(0), 0);
  assert.equal(maxTimeoutToMilliseconds(0.25), 250);
});
