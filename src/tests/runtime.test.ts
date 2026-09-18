import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runContract } from "../runtime.js";
import type { ProjectState } from "../core/types.js";

const fakeServer = fileURLToPath(
  new URL("./fixtures/fake-mcp-server.js", import.meta.url),
);

test("runContract executes MCP step, persists evidence, and marks task done", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-runtime-"));
  try {
    const contractPath = join(root, "task.json");
    const configPath = join(root, "config.json");

    await writeFile(
      contractPath,
      JSON.stringify(
        {
          id: "T-E2E",
          title: "Runtime E2E",
          goal: "Prove the full headless loop",
          kind: "integration",
          dependencies: [],
          maxAttempts: 2,
          acceptanceCriteria: [
            {
              id: "A01",
              description: "MCP execution passes",
              requiredEvidence: ["test"],
            },
          ],
          execution: {
            steps: [
              {
                id: "run-test",
                adapter: "unity",
                action: "tests",
                criterionId: "A01",
                evidenceType: "test",
                input: { suite: "smoke" },
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
                tests: { tool: "echo" },
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runContract({
      projectRoot: root,
      contractPath,
      configPath,
    });

    assert.equal(result.gate.passed, true);

    const state = JSON.parse(
      await readFile(join(root, ".project", "state.json"), "utf8"),
    ) as ProjectState;
    assert.equal(state.tasks["T-E2E"]?.status, "done");

    const evidence = JSON.parse(
      await readFile(join(root, ".project", "evidence", "T-E2E.json"), "utf8"),
    ) as Array<{ outcome: string; summary: string }>;
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]?.outcome, "pass");
    assert.match(evidence[0]?.summary ?? "", /smoke/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
