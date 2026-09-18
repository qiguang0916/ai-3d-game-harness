import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpActionAdapter } from "../adapters/mcp-action.js";
import { PipelineTaskExecutor } from "../core/pipeline-executor.js";
import { initialProjectState } from "../core/state-store.js";
import type { EvidenceRecord, TaskContract } from "../core/types.js";
import { JsonEvidenceStore } from "../evidence/store.js";

const fakeServer = fileURLToPath(
  new URL("./fixtures/fake-mcp-server.js", import.meta.url),
);

test("downstream task can consume latest dependency artifact evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-dependency-evidence-"));
  const evidenceStore = new JsonEvidenceStore(join(root, "evidence"));

  const dependencyEvidence: EvidenceRecord = {
    id: "A:export:attempt-2",
    taskId: "A",
    criterionId: "A02",
    type: "file",
    outcome: "pass",
    summary: "exported",
    capturedAt: new Date().toISOString(),
    attempt: 2,
    uri: "/tmp/KNIFE_001.fbx",
  };
  await evidenceStore.appendMany([dependencyEvidence]);

  const adapter = new McpActionAdapter("unity", {
    type: "mcp-stdio",
    command: process.execPath,
    args: [fakeServer],
    actions: {
      import_asset: {
        tool: "echo",
        mergeInput: false,
        argumentsTemplate: {
          path: { $from: "input.sourcePath" },
          asset: { $from: "input.assetId" },
        },
      },
    },
  });

  const task: TaskContract = {
    id: "B",
    title: "Unity import",
    goal: "Consume Blender artifact",
    kind: "unity",
    dependencies: ["A"],
    maxAttempts: 1,
    acceptanceCriteria: [
      {
        id: "B01",
        description: "import receives exported path",
        requiredEvidence: ["asset-report"],
      },
    ],
    execution: {
      steps: [
        {
          id: "import",
          adapter: "unity",
          action: "import_asset",
          criterionId: "B01",
          evidenceType: "asset-report",
          input: {
            assetId: "KNIFE_001",
            sourcePath: {
              $from: "dependencies.A.latestByType.file.uri",
            },
          },
        },
      ],
    },
  };

  const state = initialProjectState([task]);
  state.tasks.B!.attempts = 1;
  state.tasks.A = {
    taskId: "A",
    status: "done",
    attempts: 2,
    evidenceIds: [dependencyEvidence.id],
  };

  try {
    const executor = new PipelineTaskExecutor(
      [adapter],
      root,
      evidenceStore,
    );
    const result = await executor.execute(task, state);
    const summary = result.evidence[0]?.summary ?? "";

    assert.match(summary, /KNIFE_001\.fbx/);
    assert.match(summary, /KNIFE_001/);
  } finally {
    await adapter.close();
    await rm(root, { recursive: true, force: true });
  }
});
