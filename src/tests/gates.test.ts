import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTaskGate } from "../core/gates.js";
import type { EvidenceRecord, TaskContract } from "../core/types.js";

const task: TaskContract = {
  id: "T1",
  title: "Gate task",
  goal: "Verify evidence gating",
  kind: "generic",
  dependencies: [],
  maxAttempts: 2,
  acceptanceCriteria: [
    {
      id: "A01",
      description: "runtime is visible and clean",
      requiredEvidence: ["screenshot", "log"],
    },
  ],
};

const evidence = (
  type: EvidenceRecord["type"],
  outcome: EvidenceRecord["outcome"] = "pass",
): EvidenceRecord => ({
  id: `E-${type}-${outcome}`,
  taskId: "T1",
  criterionId: "A01",
  type,
  outcome,
  summary: "test",
  capturedAt: new Date(0).toISOString(),
});

test("gate fails when required evidence is missing", () => {
  const result = evaluateTaskGate(task, [evidence("screenshot")]);
  assert.equal(result.passed, false);
  assert.deepEqual(result.criteria[0]?.missingEvidence, ["log"]);
});

test("gate passes only with all required passing evidence", () => {
  const result = evaluateTaskGate(task, [
    evidence("screenshot"),
    evidence("log"),
  ]);
  assert.equal(result.passed, true);
});

test("explicit failing evidence keeps a criterion failed", () => {
  const result = evaluateTaskGate(task, [
    evidence("screenshot"),
    evidence("log"),
    evidence("log", "fail"),
  ]);
  assert.equal(result.passed, false);
  assert.equal(result.criteria[0]?.failingEvidenceIds.length, 1);
});
