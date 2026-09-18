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

  assert.equal(config.adapters.blender?.command, "blender-mcp");
  assert.equal(config.adapters.blender?.actions.inspect?.tool, "inspect_scene");
});
