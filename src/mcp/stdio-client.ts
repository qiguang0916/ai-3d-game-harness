import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  McpInitializeResult,
  McpTool,
  McpToolResult,
} from "./types.js";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  method?: string;
  params?: unknown;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timer: NodeJS.Timeout;
}

export interface StdioMcpClientOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  protocolVersion?: string;
}

export class StdioMcpClient {
  private process?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number | string, PendingRequest>();
  private stderr = "";
  private initialized = false;

  constructor(private readonly options: StdioMcpClientOptions) {}

  async connect(): Promise<McpInitializeResult> {
    if (this.initialized) {
      throw new Error("MCP client is already initialized.");
    }

    const child = spawn(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...(this.options.env ?? {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;

    child.on("error", (error) => {
      this.rejectAll(new Error(`MCP process error: ${error.message}`));
    });

    child.on("exit", (code, signal) => {
      if (this.pending.size > 0) {
        this.rejectAll(
          new Error(
            `MCP process exited while requests were pending (code=${String(code)}, signal=${String(signal)}). stderr=${this.stderr.trim()}`,
          ),
        );
      }
      this.initialized = false;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-16_384);
    });

    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      const trimmed = line.trim();
      if (trimmed === "") return;
      try {
        this.handleMessage(JSON.parse(trimmed) as JsonRpcResponse);
      } catch {
        this.stderr = (
          this.stderr + `\n[invalid MCP stdout] ${trimmed}`
        ).slice(-16_384);
      }
    });

    const result = (await this.request("initialize", {
      protocolVersion: this.options.protocolVersion ?? "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "ai-3d-game-harness",
        version: "0.1.0",
      },
    })) as McpInitializeResult;

    this.notify("notifications/initialized", {});
    this.initialized = true;
    return result;
  }

  async listTools(): Promise<McpTool[]> {
    this.assertConnected();
    const tools: McpTool[] = [];
    let cursor: string | undefined;

    do {
      const params = cursor ? { cursor } : {};
      const result = (await this.request("tools/list", params)) as {
        tools?: McpTool[];
        nextCursor?: string;
      };
      tools.push(...(result.tools ?? []));
      cursor = result.nextCursor;
    } while (cursor);

    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<McpToolResult> {
    this.assertConnected();
    return (await this.request("tools/call", {
      name,
      arguments: args,
    })) as McpToolResult;
  }

  async close(): Promise<void> {
    const child = this.process;
    this.process = undefined;
    this.initialized = false;
    if (!child || child.killed) return;

    child.stdin.end();
    child.kill("SIGTERM");

    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, 1_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private assertConnected(): void {
    if (!this.process || !this.initialized) {
      throw new Error("MCP client is not connected.");
    }
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.process) throw new Error("MCP process has not been started.");

    const id = this.nextId++;
    const timeoutMs = this.options.timeoutMs ?? 30_000;

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `MCP request timed out after ${timeoutMs}ms: ${method}. stderr=${this.stderr.trim()}`,
          ),
        );
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.write({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });
    });
  }

  private write(message: Record<string, unknown>): void {
    const child = this.process;
    if (!child || !child.stdin.writable) {
      throw new Error("MCP stdin is not writable.");
    }
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleMessage(message: JsonRpcResponse): void {
    if (message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(
        new Error(
          `MCP error ${message.error.code}: ${message.error.message}`,
        ),
      );
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}
