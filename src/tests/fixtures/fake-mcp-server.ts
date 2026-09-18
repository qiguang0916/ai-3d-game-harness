import { existsSync } from "node:fs";
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
          {
            name: "file_gate",
            description: "Pass only when a file exists",
            inputSchema: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
          },
        ],
      },
    });
    return;
  }

  if (request.method === "tools/call") {
    const params = request.params ?? {};
    const name = params.name;
    const args =
      typeof params.arguments === "object" &&
      params.arguments !== null &&
      !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};

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

    if (name === "file_gate") {
      const path = typeof args.path === "string" ? args.path : "";
      const exists = path !== "" && existsSync(path);
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          isError: !exists,
          content: [
            {
              type: "text",
              text: exists ? `file exists: ${path}` : `file missing: ${path}`,
            },
          ],
          structuredContent: { path, exists },
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
