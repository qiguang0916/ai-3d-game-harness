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


test("harness config preserves MCP uri paths and semantic checks", () => {
  const config = parseHarnessConfig({
    version: 1,
    adapters: {
      unity: {
        type: "mcp-stdio",
        command: "unity-mcp",
        actions: {
          console: {
            tool: "read_console",
            uriPath: "structuredContent.reportPath",
            failureTextIncludes: ["error"],
            checks: [
              {
                path: "structuredContent.errorCount",
                operator: "equals",
                value: 0
              },
              {
                path: "structuredContent.entries.length",
                operator: "gte",
                value: 0
              }
            ]
          }
        }
      }
    }
  });

  const unity = config.adapters.unity;
  assert.ok(unity && unity.type === "mcp-stdio");
  if (!unity || unity.type !== "mcp-stdio") {
    throw new Error("expected MCP adapter");
  }

  const mapping = unity.actions.console;
  assert.equal(mapping?.uriPath, "structuredContent.reportPath");
  assert.deepEqual(mapping?.failureTextIncludes, ["error"]);
  assert.deepEqual(mapping?.checks, [
    {
      path: "structuredContent.errorCount",
      operator: "equals",
      value: 0
    },
    {
      path: "structuredContent.entries.length",
      operator: "gte",
      value: 0
    }
  ]);
});

test("harness config rejects unknown MCP check operators", () => {
  assert.throws(
    () =>
      parseHarnessConfig({
        version: 1,
        adapters: {
          unity: {
            type: "mcp-stdio",
            command: "unity-mcp",
            actions: {
              console: {
                tool: "read_console",
                checks: [
                  {
                    path: "structuredContent.errorCount",
                    operator: "approximately",
                    value: 0
                  }
                ]
              }
            }
          }
        }
      }),
    /operator is invalid/
  );
});
