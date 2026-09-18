import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { McpActionAdapter } from "../adapters/mcp-action.js";
import { PipelineTaskExecutor } from "../core/pipeline-executor.js";
import { initialProjectState } from "../core/state-store.js";
import type { TaskContract } from "../core/types.js";

const fakeServer = fileURLToPath(
  new URL("./fixtures/fake-mcp-server.js", import.meta.url),
);

test("MCP action adapter drives a task step and produces evidence", async () => {
  const adapter = new McpActionAdapter("unity", {
    type: "mcp-stdio",
    command: process.execPath,
    args: [fakeServer],
    actions: {
      validate: { tool: "echo", defaultArguments: { source: "unity" } },
    },
  });

  const task: TaskContract = {
    id: "T1",
    title: "Validate",
    goal: "Validate via MCP",
    kind: "unity",
    dependencies: [],
    maxAttempts: 2,
    acceptanceCriteria: [
      {
        id: "A01",
        description: "Validation report",
        requiredEvidence: ["test"],
      },
    ],
    execution: {
      steps: [
        {
          id: "validate",
          adapter: "unity",
          action: "validate",
          criterionId: "A01",
          evidenceType: "test",
          input: { target: "scene" },
        },
      ],
    },
  };

  try {
    const health = await adapter.healthcheck();
    assert.equal(health.ok, true);

    const state = initialProjectState([task]);
    state.tasks.T1!.attempts = 1;
    const executor = new PipelineTaskExecutor([adapter]);
    const result = await executor.execute(task, state);

    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0]?.outcome, "pass");
    assert.match(result.evidence[0]?.summary ?? "", /scene/);
  } finally {
    await adapter.close();
  }
});


test("MCP action mapping can fail a successful tool call using semantic checks", async () => {
  const adapter = new McpActionAdapter("unity", {
    type: "mcp-stdio",
    command: process.execPath,
    args: [fakeServer],
    actions: {
      validate: {
        tool: "echo",
        successPath: "structuredContent.received.ok",
      },
    },
  });

  const task: TaskContract = {
    id: "T-SEMANTIC",
    title: "Semantic validation",
    goal: "Separate invocation success from QA success",
    kind: "unity",
    dependencies: [],
    maxAttempts: 1,
    acceptanceCriteria: [
      {
        id: "A01",
        description: "semantic check",
        requiredEvidence: ["test"],
      },
    ],
    execution: {
      steps: [
        {
          id: "validate",
          adapter: "unity",
          action: "validate",
          criterionId: "A01",
          evidenceType: "test",
          input: { ok: false },
        },
      ],
    },
  };

  try {
    const state = initialProjectState([task]);
    state.tasks["T-SEMANTIC"]!.attempts = 1;
    const executor = new PipelineTaskExecutor([adapter]);
    const result = await executor.execute(task, state);
    assert.equal(result.evidence[0]?.outcome, "fail");
    assert.match(
      String(result.evidence[0]?.metadata?.outcomeReason),
      /success-path-not-true/,
    );
  } finally {
    await adapter.close();
  }
});


test("later MCP steps can consume structured output from earlier steps", async () => {
  const adapter = new McpActionAdapter("unity", {
    type: "mcp-stdio",
    command: process.execPath,
    args: [fakeServer],
    actions: {
      start_tests: { tool: "echo" },
      poll_tests: { tool: "echo" },
    },
  });

  const task: TaskContract = {
    id: "T-BINDING",
    title: "Step binding",
    goal: "Pass a job id between asynchronous workflow steps",
    kind: "unity",
    dependencies: [],
    maxAttempts: 1,
    acceptanceCriteria: [
      {
        id: "A01",
        description: "poll receives the prior job id",
        requiredEvidence: ["test"],
      },
    ],
    execution: {
      steps: [
        {
          id: "start",
          adapter: "unity",
          action: "start_tests",
          criterionId: "A01",
          evidenceType: "test",
          input: { job_id: "job-123" },
        },
        {
          id: "poll",
          adapter: "unity",
          action: "poll_tests",
          criterionId: "A01",
          evidenceType: "test",
          input: {
            job_id: {
              $from: "steps.start.metadata.structuredContent.received.job_id",
            },
          },
        },
      ],
    },
  };

  try {
    const state = initialProjectState([task]);
    state.tasks["T-BINDING"]!.attempts = 1;
    const executor = new PipelineTaskExecutor([adapter]);
    const result = await executor.execute(task, state);

    assert.equal(result.evidence.length, 2);
    assert.match(result.evidence[1]?.summary ?? "", /job-123/);
  } finally {
    await adapter.close();
  }
});
