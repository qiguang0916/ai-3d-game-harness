import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonEvidenceStore } from "../evidence/store.js";
import { JsonStateStore } from "../core/state-store.js";
import { writeProjectReport } from "../report.js";

test("project report writes JSON and Markdown summaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-report-"));
  try {
    const contractsDir = join(root, "contracts");
    await mkdir(contractsDir);
    await writeFile(
      join(contractsDir, "task.json"),
      JSON.stringify(
        {
          id: "T1",
          title: "Report task",
          goal: "Generate report",
          kind: "generic",
          dependencies: [],
          maxAttempts: 2,
          acceptanceCriteria: [
            {
              id: "A01",
              description: "test passed",
              requiredEvidence: ["test"],
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const stateStore = new JsonStateStore(
      join(root, ".project", "state.json"),
    );
    await stateStore.save({
      version: 1,
      tasks: {
        T1: {
          taskId: "T1",
          status: "done",
          attempts: 1,
          evidenceIds: ["E1"],
        },
      },
    });

    const evidenceStore = new JsonEvidenceStore(
      join(root, ".project", "evidence"),
    );
    await evidenceStore.appendMany([
      {
        id: "E1",
        taskId: "T1",
        criterionId: "A01",
        type: "test",
        outcome: "pass",
        summary: "passed",
        capturedAt: new Date(0).toISOString(),
        attempt: 1,
      },
    ]);

    const result = await writeProjectReport(root, contractsDir);
    assert.equal(result.report.passed, true);

    const json = await readFile(result.jsonPath, "utf8");
    const markdown = await readFile(result.markdownPath, "utf8");
    assert.match(json, /"passed": true/);
    assert.match(markdown, /Overall: \*\*PASS\*\*/);
    assert.match(markdown, /T1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
