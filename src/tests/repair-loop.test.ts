import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runContractAuto } from "../runtime.js";
import type { EvidenceRecord, ProjectState } from "../core/types.js";

const fakeServer = fileURLToPath(
  new URL("./fixtures/fake-mcp-server.js", import.meta.url),
);
const fakeRepair = fileURLToPath(
  new URL("./fixtures/fake-repair.js", import.meta.url),
);

test("automatic repair loop fixes a failed gate and revalidates", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-repair-"));
  const marker = join(root, "repair.marker");

  try {
    const contractPath = join(root, "task.json");
    const configPath = join(root, "config.json");

    await writeFile(
      contractPath,
      JSON.stringify(
        {
          id: "T-REPAIR",
          title: "Repairable task",
          goal: "Fail once, repair, and pass",
          kind: "integration",
          dependencies: [],
          maxAttempts: 3,
          acceptanceCriteria: [
            {
              id: "A01",
              description: "Repair marker exists",
              requiredEvidence: ["test"],
            },
          ],
          execution: {
            steps: [
              {
                id: "gate",
                adapter: "unity",
                action: "file_gate",
                criterionId: "A01",
                evidenceType: "test",
                input: { path: marker },
              },
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeFile(
      configPath,
      JSON.stringify(
        {
          version: 1,
          adapters: {
            unity: {
              type: "mcp-stdio",
              command: process.execPath,
              args: [fakeServer],
              actions: {
                file_gate: { tool: "file_gate" },
              },
            },
          },
          repair: {
            type: "json-process",
            command: process.execPath,
            args: [fakeRepair],
            env: {
              REPAIR_MARKER: marker,
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runContractAuto({
      projectRoot: root,
      contractPath,
      configPath,
    });

    assert.equal(result.gate.passed, true);
    assert.equal(result.summary.attempts, 2);
    assert.equal(result.repairs.length, 1);

    const state = JSON.parse(
      await readFile(join(root, ".project", "state.json"), "utf8"),
    ) as ProjectState;
    assert.equal(state.tasks["T-REPAIR"]?.status, "done");

    const evidence = JSON.parse(
      await readFile(
        join(root, ".project", "evidence", "T-REPAIR.json"),
        "utf8",
      ),
    ) as EvidenceRecord[];

    assert.equal(evidence.length, 2);
    assert.equal(evidence[0]?.outcome, "fail");
    assert.equal(evidence[0]?.attempt, 1);
    assert.equal(evidence[1]?.outcome, "pass");
    assert.equal(evidence[1]?.attempt, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
