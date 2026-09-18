import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { StdioMcpClient } from "../mcp/stdio-client.js";

const fakeServer = fileURLToPath(
  new URL("./fixtures/fake-mcp-server.js", import.meta.url),
);

test("stdio MCP client initializes, lists tools, and calls a tool", async () => {
  const client = new StdioMcpClient({
    command: process.execPath,
    args: [fakeServer],
    timeoutMs: 5_000,
  });

  try {
    const init = await client.connect();
    assert.equal(init.serverInfo.name, "fake-mcp");

    const tools = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ["echo", "fail", "file_gate"],
    );

    const result = await client.callTool("echo", { value: 42 });
    assert.equal(result.isError, false);
    assert.match(
      JSON.stringify(result.structuredContent),
      /42/,
    );
  } finally {
    await client.close();
  }
});
