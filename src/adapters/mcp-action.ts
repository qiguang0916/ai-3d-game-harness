import type { McpStdioAdapterConfig } from "../config.js";
import { StdioMcpClient } from "../mcp/stdio-client.js";
import type { McpToolResult } from "../mcp/types.js";
import type {
  ActionAdapter,
  ActionExecutionContext,
  ActionExecutionResult,
} from "./action.js";
import type { AdapterHealth } from "./types.js";

const resultSummary = (result: McpToolResult): string => {
  const text: string[] = [];
  for (const item of result.content ?? []) {
    if (
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string"
    ) {
      text.push(item.text);
    }
  }

  if (text.length > 0) return text.join("\n").slice(0, 8_000);
  if (result.structuredContent !== undefined) {
    return JSON.stringify(result.structuredContent).slice(0, 8_000);
  }
  return result.isError ? "MCP tool reported an error." : "MCP tool completed.";
};

export class McpActionAdapter implements ActionAdapter {
  private readonly client: StdioMcpClient;
  private connected = false;

  constructor(
    readonly id: string,
    private readonly config: McpStdioAdapterConfig,
  ) {
    this.client = new StdioMcpClient({
      command: config.command,
      ...(config.args ? { args: config.args } : {}),
      ...(config.cwd ? { cwd: config.cwd } : {}),
      ...(config.env ? { env: config.env } : {}),
      ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
      ...(config.protocolVersion
        ? { protocolVersion: config.protocolVersion }
        : {}),
    });
  }

  supportsAction(action: string): boolean {
    return this.config.actions[action] !== undefined;
  }

  async healthcheck(): Promise<AdapterHealth> {
    try {
      await this.ensureConnected();
      const tools = await this.client.listTools();
      const names = new Set(tools.map((tool) => tool.name));
      const mappings = Object.entries(this.config.actions);
      const missingTools = mappings
        .filter(([, mapping]) => !names.has(mapping.tool))
        .map(([action, mapping]) => ({ action, tool: mapping.tool }));

      return {
        ok: missingTools.length === 0,
        adapter: this.id,
        details: {
          transport: "stdio",
          toolCount: tools.length,
          tools: tools.map((tool) => tool.name),
          missingTools,
        },
      };
    } catch (error) {
      return {
        ok: false,
        adapter: this.id,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async executeAction(
    action: string,
    input: Record<string, unknown>,
    context: ActionExecutionContext,
  ): Promise<ActionExecutionResult> {
    const mapping = this.config.actions[action];
    if (!mapping) {
      throw new Error(`Adapter ${this.id} does not map action ${action}.`);
    }

    await this.ensureConnected();
    const args = {
      ...(mapping.defaultArguments ?? {}),
      ...input,
    };
    const result = await this.client.callTool(mapping.tool, args);

    const metadata: Record<string, unknown> = {
      adapter: this.id,
      action,
      tool: mapping.tool,
      stepId: context.step.id,
      mcpIsError: result.isError === true,
    };
    if (result.structuredContent !== undefined) {
      metadata.structuredContent = result.structuredContent;
    }

    return {
      outcome: result.isError === true ? "fail" : "pass",
      summary: resultSummary(result),
      metadata,
    };
  }

  async close(): Promise<void> {
    await this.client.close();
    this.connected = false;
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
  }
}
