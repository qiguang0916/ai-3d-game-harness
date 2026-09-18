import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadTaskContracts } from "../core/contracts.js";
import { assertTaskGraph } from "../core/task-graph.js";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);

test("KNIFE_001 reference contracts form a valid dependency DAG", async () => {
  const contracts = await loadTaskContracts(
    resolve(repositoryRoot, "examples/knife-001/contracts"),
  );

  assertTaskGraph(contracts);
  assert.deepEqual(
    contracts.map((task) => task.id),
    [
      "T-KNIFE-001-BLENDER",
      "T-KNIFE-001-UNITY",
      "T-KNIFE-001-QA",
    ],
  );
  assert.equal(
    contracts.every((task) => (task.execution?.steps.length ?? 0) > 0),
    true,
  );
});
