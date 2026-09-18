import test from "node:test";
import assert from "node:assert/strict";
import { Orchestrator } from "../core/orchestrator.js";
import { initialProjectState } from "../core/state-store.js";
import type { ProjectState, TaskContract } from "../core/types.js";
import { MockPassAdapter } from "../adapters/mock.js";

class MemorySink {
  snapshots: ProjectState[] = [];

  async save(state: ProjectState): Promise<void> {
    this.snapshots.push(structuredClone(state));
  }
}

const task: TaskContract = {
  id: "T1",
  title: "Run task",
  goal: "exercise orchestrator",
  kind: "generic",
  dependencies: [],
  maxAttempts: 2,
  acceptanceCriteria: [
    {
      id: "A01",
      description: "must have test evidence",
      requiredEvidence: ["test"],
    },
  ],
};

test("orchestrator marks a task done only after gate passes", async () => {
  const state = initialProjectState([task]);
  const sink = new MemorySink();
  const orchestrator = new Orchestrator([new MockPassAdapter()], sink);

  const result = await orchestrator.runTask(task, state);

  assert.equal(result.gate.passed, true);
  assert.equal(state.tasks.T1?.status, "done");
  assert.equal(state.tasks.T1?.attempts, 1);
  assert.ok(sink.snapshots.length >= 2);
});
