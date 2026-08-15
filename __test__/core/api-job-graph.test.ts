import assert from "node:assert/strict";
import test from "node:test";
import { buildApiJobGraph } from "../../src/core/api-job-graph.js";

test("buildApiJobGraph orders selected APIs from their declared dependencies", () => {
  assert.deepEqual(
    buildApiJobGraph(["vm", "attach-acl", "acl-rule", "acl-list", "subnet", "vpc"])
      .map(({ id, dependsOn }) => ({ id, dependsOn })),
    [
      { id: "vpc", dependsOn: [] },
      { id: "subnet", dependsOn: ["vpc"] },
      { id: "vm", dependsOn: ["subnet"] },
      { id: "acl-list", dependsOn: ["vpc"] },
      { id: "attach-acl", dependsOn: ["subnet", "acl-list"] },
      { id: "acl-rule", dependsOn: ["acl-list"] },
    ],
  );
});

test("buildApiJobGraph rejects invalid API selections", () => {
  assert.throws(() => buildApiJobGraph(["unknown"]), /Unknown API ID/);
  assert.throws(() => buildApiJobGraph(["vpc", "vpc"]), /Duplicate API ID/);
  assert.throws(() => buildApiJobGraph(["subnet"]), /requires missing dependency: vpc/);
  assert.throws(
    () => buildApiJobGraph(["a", "b"], {
      a: { id: "a", command: "a", handler: "a", dependsOn: ["b"] },
      b: { id: "b", command: "b", handler: "b", dependsOn: ["a"] },
    }),
    /dependency cycle/,
  );
});
