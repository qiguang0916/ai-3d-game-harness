import { createInterface } from "node:readline";

interface Request {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

const input = createInterface({ input: process.stdin });

const send = (message: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

input.on("line", (line) => {
  if (line.trim() === "") return;
  const request = JSON.parse(line) as Request;
  if (request.id === undefined) return;

  if (request.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fake-mcp", version: "1.0.0" },
      },
    });
    return;
  }

  if (request.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: [
          {
            name: "echo",
            description: "Echo arguments",
            inputSchema: { type: "object" },
          },
          {
            name: "fail",
            description: "Return an MCP tool error result",
            inputSchema: { type: "object" },
          },
        ],
      },
    });
    return;
  }

  if (request.method === "tools/call") {
    const params = request.params ?? {};
    const name = params.name;
    const args = params.arguments ?? {};
    if (name === "fail") {
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          isError: true,
          content: [{ type: "text", text: "requested failure" }],
        },
      });
      return;
    }

    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        isError: false,
        content: [{ type: "text", text: `echo:${JSON.stringify(args)}` }],
        structuredContent: { received: args },
      },
    });
    return;
  }

  send({
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32601, message: "Method not found" },
  });
});
