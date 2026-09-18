import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runProject } from "../runtime.js";

const fakeServer = fileURLToPath(
  new URL("./fixtures/fake-mcp-server.js", import.meta.url),
);

const task = (
  id: string,
  dependencies: string[],
  action: "pass" | "fail",
) => ({
  id,
  title: id,
  goal: id,
  kind: "integration",
  dependencies,
  maxAttempts: 2,
  acceptanceCriteria: [
    {
      id: "A01",
      description: "task gate",
      requiredEvidence: ["test"],
    },
  ],
  execution: {
    steps: [
      {
        id: "step",
        adapter: "unity",
        action,
        criterionId: "A01",
        evidenceType: "test",
      },
    ],
  },
});

const writeConfig = async (root: string): Promise<string> => {
  const path = join(root, "config.json");
  await writeFile(
    path,
    JSON.stringify(
      {
        version: 1,
        adapters: {
          unity: {
            type: "mcp-stdio",
            command: process.execPath,
            args: [fakeServer],
            actions: {
              pass: { tool: "echo" },
              fail: { tool: "fail" },
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return path;
};

test("project runner advances dependency DAG to completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-project-pass-"));
  try {
    const contractsDir = join(root, "contracts");
    await mkdir(contractsDir);
    await writeFile(
      join(contractsDir, "01-a.json"),
      JSON.stringify(task("A", [], "pass"), null, 2),
      "utf8",
    );
    await writeFile(
      join(contractsDir, "02-b.json"),
      JSON.stringify(task("B", ["A"], "pass"), null, 2),
      "utf8",
    );

    const configPath = await writeConfig(root);
    const result = await runProject({
      projectRoot: root,
      contractsDir,
      configPath,
    });

    assert.equal(result.passed, true);
    assert.equal(result.state.tasks.A?.status, "done");
    assert.equal(result.state.tasks.B?.status, "done");
    assert.deepEqual(
      result.taskRuns.map((run) => run.taskId),
      ["A", "B"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project runner blocks downstream tasks after upstream gate failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-project-fail-"));
  try {
    const contractsDir = join(root, "contracts");
    await mkdir(contractsDir);
    await writeFile(
      join(contractsDir, "01-a.json"),
      JSON.stringify(task("A", [], "fail"), null, 2),
      "utf8",
    );
    await writeFile(
      join(contractsDir, "02-b.json"),
      JSON.stringify(task("B", ["A"], "pass"), null, 2),
      "utf8",
    );

    const configPath = await writeConfig(root);
    const result = await runProject({
      projectRoot: root,
      contractsDir,
      configPath,
    });

    assert.equal(result.passed, false);
    assert.equal(result.state.tasks.A?.status, "failed");
    assert.equal(result.state.tasks.B?.status, "blocked");
    assert.match(result.state.tasks.B?.lastError ?? "", /Dependency A/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("project runner records execution-process failures and still finalizes state", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-project-error-"));
  try {
    const contractsDir = join(root, "contracts");
    await mkdir(contractsDir);
    await writeFile(
      join(contractsDir, "01-a.json"),
      JSON.stringify(task("A", [], "agent-fail" as never), null, 2),
      "utf8",
    );
    await writeFile(
      join(contractsDir, "02-b.json"),
      JSON.stringify(task("B", ["A"], "pass"), null, 2),
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
              type: "json-process",
              command: process.execPath,
              args: ["-e", "process.exit(3)"],
              actions: ["agent-fail", "pass"],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runProject({
      projectRoot: root,
      contractsDir,
      configPath,
    });

    assert.equal(result.passed, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]?.taskId, "A");
    assert.equal(result.state.tasks.A?.status, "failed");
    assert.equal(result.state.tasks.B?.status, "blocked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
