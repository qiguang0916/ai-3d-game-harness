import test from "node:test";
import assert from "node:assert/strict";
import { parseTaskContract } from "../core/contracts.js";

test("parseTaskContract accepts a valid contract", () => {
  const contract = parseTaskContract({
    id: "T1",
    title: "Test",
    goal: "Validate",
    kind: "blender",
    dependencies: [],
    acceptanceCriteria: [
      {
        id: "A01",
        description: "Asset report exists",
        requiredEvidence: ["asset-report"],
      },
    ],
    maxAttempts: 3,
  });

  assert.equal(contract.id, "T1");
  assert.equal(contract.kind, "blender");
});

test("parseTaskContract rejects duplicate criterion IDs", () => {
  assert.throws(() =>
    parseTaskContract({
      id: "T1",
      title: "Test",
      goal: "Validate",
      kind: "generic",
      dependencies: [],
      acceptanceCriteria: [
        { id: "A", description: "one", requiredEvidence: [] },
        { id: "A", description: "two", requiredEvidence: [] },
      ],
      maxAttempts: 1,
    }),
  );
});
