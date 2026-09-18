import test from "node:test";
import assert from "node:assert/strict";
import { parseHarnessConfig } from "../config.js";

test("harness config parses MCP action mappings", () => {
  const config = parseHarnessConfig({
    version: 1,
    adapters: {
      blender: {
        type: "mcp-stdio",
        command: "blender-mcp",
        args: ["--stdio"],
        actions: {
          inspect: {
            tool: "inspect_scene",
            defaultArguments: { mode: "strict" },
          },
        },
      },
    },
  });

  const blender = config.adapters.blender;
  assert.ok(blender);
  assert.equal(blender.type, "mcp-stdio");
  if (blender.type !== "mcp-stdio") {
    throw new Error("expected MCP adapter");
  }
  assert.equal(blender.command, "blender-mcp");
  assert.equal(blender.actions.inspect?.tool, "inspect_scene");
});

test("harness config parses JSON process action adapters", () => {
  const config = parseHarnessConfig({
    version: 1,
    adapters: {
      codex: {
        type: "json-process",
        command: "codex-wrapper",
        actions: ["implement", "review"],
      },
    },
  });

  const codex = config.adapters.codex;
  assert.ok(codex);
  assert.equal(codex.type, "json-process");
  if (codex.type !== "json-process") {
    throw new Error("expected JSON process adapter");
  }
  assert.deepEqual(codex.actions, ["implement", "review"]);
});
