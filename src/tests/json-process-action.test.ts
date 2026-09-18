import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { JsonProcessActionAdapter } from "../adapters/json-process-action.js";
import { PipelineTaskExecutor } from "../core/pipeline-executor.js";
import { initialProjectState } from "../core/state-store.js";
import type { TaskContract } from "../core/types.js";

const fakeAction = fileURLToPath(
  new URL("./fixtures/fake-action-process.js", import.meta.url),
);

test("JSON process adapter can act as an agent execution step", async () => {
  const adapter = new JsonProcessActionAdapter("codex", {
    type: "json-process",
    command: process.execPath,
    args: [fakeAction],
    actions: ["implement"],
  });

  const task: TaskContract = {
    id: "T-AGENT",
    title: "Agent step",
    goal: "Exercise process adapter",
    kind: "gameplay",
    dependencies: [],
    maxAttempts: 1,
    acceptanceCriteria: [
      {
        id: "A01",
        description: "agent completes implementation",
        requiredEvidence: ["log"],
      },
    ],
    execution: {
      steps: [
        {
          id: "implement",
          adapter: "codex",
          action: "implement",
          criterionId: "A01",
          evidenceType: "log",
          input: { feature: "grinding" },
        },
      ],
    },
  };

  const state = initialProjectState([task]);
  state.tasks["T-AGENT"]!.attempts = 1;
  const executor = new PipelineTaskExecutor(
    [adapter],
    "/tmp/example-game",
  );
  const result = await executor.execute(task, state);

  assert.equal(result.evidence[0]?.outcome, "pass");
  assert.match(result.evidence[0]?.summary ?? "", /implement/);
  assert.equal(
    result.evidence[0]?.metadata?.projectRoot,
    "/tmp/example-game",
  );
});
