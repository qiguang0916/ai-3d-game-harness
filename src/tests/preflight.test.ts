import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { preflightProject } from "../preflight.js";

const fakeServer = fileURLToPath(
  new URL("./fixtures/fake-mcp-server.js", import.meta.url),
);

test("preflight reports task actions that are not configured", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-preflight-"));
  try {
    const contractsDir = join(root, "contracts");
    await mkdir(contractsDir);
    await writeFile(
      join(contractsDir, "task.json"),
      JSON.stringify(
        {
          id: "T1",
          title: "Preflight",
          goal: "Detect bad action",
          kind: "unity",
          dependencies: [],
          maxAttempts: 1,
          acceptanceCriteria: [
            {
              id: "A01",
              description: "test",
              requiredEvidence: ["test"],
            },
          ],
          execution: {
            steps: [
              {
                id: "bad",
                adapter: "unity",
                action: "not-configured",
                criterionId: "A01",
                evidenceType: "test",
              },
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const configPath = join(root, "config.json");
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
                configured: { tool: "echo" },
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await preflightProject(contractsDir, configPath);
    assert.equal(result.ok, false);
    assert.equal(
      result.issues.some((issue) => issue.code === "unsupported-action"),
      true,
    );
    assert.equal(result.adapterHealth[0]?.ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
