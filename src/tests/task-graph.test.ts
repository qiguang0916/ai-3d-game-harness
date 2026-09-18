import test from "node:test";
import assert from "node:assert/strict";
import { assertTaskGraph, readyTasks, TaskGraphError } from "../core/task-graph.js";
import { initialProjectState } from "../core/state-store.js";
import type { TaskContract } from "../core/types.js";

const base = (id: string, dependencies: string[] = []): TaskContract => ({
  id,
  title: id,
  goal: id,
  kind: "generic",
  dependencies,
  acceptanceCriteria: [
    {
      id: "A01",
      description: "done",
      requiredEvidence: ["test"],
    },
  ],
  maxAttempts: 2,
});

test("task graph rejects cycles", () => {
  assert.throws(
    () => assertTaskGraph([base("A", ["B"]), base("B", ["A"])]),
    TaskGraphError,
  );
});

test("readyTasks only returns tasks whose dependencies are done", () => {
  const contracts = [base("A"), base("B", ["A"])];
  const state = initialProjectState(contracts);

  assert.deepEqual(readyTasks(contracts, state).map((task) => task.id), ["A"]);

  const a = state.tasks.A;
  assert.ok(a);
  a.status = "done";

  assert.deepEqual(readyTasks(contracts, state).map((task) => task.id), ["B"]);
});
