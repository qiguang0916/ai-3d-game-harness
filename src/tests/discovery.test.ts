import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverConfig } from "../runtime.js";

const fakeServer = fileURLToPath(
  new URL("./fixtures/fake-mcp-server.js", import.meta.url),
);

test("discoverConfig returns live MCP tool schemas", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-discover-"));
  try {
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
                tests: { tool: "echo" }
              }
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await discoverConfig(configPath, "unity");
    assert.equal(result.length, 1);
    assert.equal(result[0]?.available, true);

    const tools = result[0]?.tools as Array<{ name?: string }>;
    assert.equal(tools.some((tool) => tool.name === "echo"), true);
    assert.equal(tools.some((tool) => tool.name === "file_gate"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discoverConfig rejects unknown adapter IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-discover-missing-"));
  try {
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
                tests: { tool: "echo" }
              }
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    await assert.rejects(
      () => discoverConfig(configPath, "missing"),
      /Adapter not found/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
