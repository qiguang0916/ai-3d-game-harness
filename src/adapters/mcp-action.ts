import { isDeepStrictEqual } from "node:util";
import type {
  McpActionMapping,
  McpResultCheck,
  McpStdioAdapterConfig,
} from "../config.js";
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

const resultUri = (result: McpToolResult): string | undefined => {
  for (const item of result.content ?? []) {
    if (
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "resource" &&
      "resource" in item &&
      typeof item.resource === "object" &&
      item.resource !== null &&
      "uri" in item.resource &&
      typeof item.resource.uri === "string"
    ) {
      return item.resource.uri;
    }
  }
  return undefined;
};

const getPath = (value: unknown, path: string): unknown => {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (Array.isArray(current)) {
      if (part === "length") {
        current = current.length;
        continue;
      }
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (
      typeof current !== "object" ||
      current === null ||
      !(part in current)
    ) {
      if (typeof current === "string" && part === "length") {
        current = current.length;
        continue;
      }
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const isEmpty = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" || Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
};

const checkPasses = (
  actual: unknown,
  check: McpResultCheck,
): boolean => {
  switch (check.operator) {
    case "equals":
      return isDeepStrictEqual(actual, check.value);
    case "not-equals":
      return !isDeepStrictEqual(actual, check.value);
    case "exists":
      return actual !== undefined;
    case "empty":
      return isEmpty(actual);
    case "not-empty":
      return !isEmpty(actual);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (typeof actual !== "number" || typeof check.value !== "number") {
        return false;
      }
      if (check.operator === "gt") return actual > check.value;
      if (check.operator === "gte") return actual >= check.value;
      if (check.operator === "lt") return actual < check.value;
      return actual <= check.value;
    }
    case "includes":
      if (typeof actual === "string") {
        return actual.includes(String(check.value ?? ""));
      }
      if (Array.isArray(actual)) {
        return actual.some((item) => isDeepStrictEqual(item, check.value));
      }
      return false;
  }
};

const determineOutcome = (
  result: McpToolResult,
  mapping: McpActionMapping,
  summary: string,
): { passed: boolean; reason: string } => {
  if (result.isError === true) {
    return { passed: false, reason: "mcp-isError" };
  }

  const lowerSummary = summary.toLowerCase();
  const matchedFailureText = (mapping.failureTextIncludes ?? []).find(
    (text) => lowerSummary.includes(text.toLowerCase()),
  );
  if (matchedFailureText) {
    return {
      passed: false,
      reason: `failure-text:${matchedFailureText}`,
    };
  }

  if (mapping.successPath) {
    const value = getPath(result, mapping.successPath);
    if (value !== true) {
      return {
        passed: false,
        reason: `success-path-not-true:${mapping.successPath}`,
      };
    }
  }

  for (const check of mapping.checks ?? []) {
    const actual = getPath(result, check.path);
    if (!checkPasses(actual, check)) {
      return {
        passed: false,
        reason: `check-failed:${check.path}:${check.operator}`,
      };
    }
  }

  return { passed: true, reason: "passed" };
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

  async discoverTools(): Promise<unknown[]> {
    await this.ensureConnected();
    return this.client.listTools();
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
    const summary = resultSummary(result);
    const outcome = determineOutcome(result, mapping, summary);

    const metadata: Record<string, unknown> = {
      adapter: this.id,
      action,
      tool: mapping.tool,
      stepId: context.step.id,
      mcpIsError: result.isError === true,
      outcomeReason: outcome.reason,
    };
    if (result.structuredContent !== undefined) {
      metadata.structuredContent = result.structuredContent;
    }

    const executionResult: ActionExecutionResult = {
      outcome: outcome.passed ? "pass" : "fail",
      summary,
      metadata,
    };
    const configuredUri = mapping.uriPath
      ? getPath(result, mapping.uriPath)
      : undefined;
    const uri =
      typeof configuredUri === "string" && configuredUri !== ""
        ? configuredUri
        : resultUri(result);
    if (uri) executionResult.uri = uri;
    return executionResult;
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
