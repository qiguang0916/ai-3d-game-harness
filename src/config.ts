import { readFile } from "node:fs/promises";

export interface McpActionMapping {
  tool: string;
  defaultArguments?: Record<string, unknown>;
}

export interface McpStdioAdapterConfig {
  type: "mcp-stdio";
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  protocolVersion?: string;
  actions: Record<string, McpActionMapping>;
}

export interface HarnessConfig {
  version: 1;
  adapters: Record<string, McpStdioAdapterConfig>;
}

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
};

export function parseHarnessConfig(value: unknown): HarnessConfig {
  const raw = asRecord(value, "config");
  if (raw.version !== 1) throw new Error("config.version must be 1.");

  const adaptersRaw = asRecord(raw.adapters, "config.adapters");
  const adapters: Record<string, McpStdioAdapterConfig> = {};

  for (const [name, adapterValue] of Object.entries(adaptersRaw)) {
    const adapter = asRecord(adapterValue, `config.adapters.${name}`);
    if (adapter.type !== "mcp-stdio") {
      throw new Error(
        `config.adapters.${name}.type must be "mcp-stdio".`,
      );
    }

    const actionsRaw = asRecord(
      adapter.actions,
      `config.adapters.${name}.actions`,
    );
    const actions: Record<string, McpActionMapping> = {};

    for (const [actionName, mappingValue] of Object.entries(actionsRaw)) {
      const mapping = asRecord(
        mappingValue,
        `config.adapters.${name}.actions.${actionName}`,
      );
      const parsed: McpActionMapping = {
        tool: asString(
          mapping.tool,
          `config.adapters.${name}.actions.${actionName}.tool`,
        ),
      };
      if (mapping.defaultArguments !== undefined) {
        parsed.defaultArguments = asRecord(
          mapping.defaultArguments,
          `config.adapters.${name}.actions.${actionName}.defaultArguments`,
        );
      }
      actions[actionName] = parsed;
    }

    const parsed: McpStdioAdapterConfig = {
      type: "mcp-stdio",
      command: asString(
        adapter.command,
        `config.adapters.${name}.command`,
      ),
      actions,
    };

    if (adapter.args !== undefined) {
      if (!Array.isArray(adapter.args) || !adapter.args.every((item) => typeof item === "string")) {
        throw new Error(`config.adapters.${name}.args must be a string array.`);
      }
      parsed.args = [...adapter.args];
    }
    if (adapter.cwd !== undefined) parsed.cwd = asString(adapter.cwd, `config.adapters.${name}.cwd`);
    if (adapter.env !== undefined) {
      const env = asRecord(adapter.env, `config.adapters.${name}.env`);
      parsed.env = Object.fromEntries(
        Object.entries(env).map(([key, val]) => [key, asString(val, `env.${key}`)]),
      );
    }
    if (adapter.timeoutMs !== undefined) {
      if (typeof adapter.timeoutMs !== "number" || adapter.timeoutMs <= 0) {
        throw new Error(`config.adapters.${name}.timeoutMs must be positive.`);
      }
      parsed.timeoutMs = adapter.timeoutMs;
    }
    if (adapter.protocolVersion !== undefined) {
      parsed.protocolVersion = asString(
        adapter.protocolVersion,
        `config.adapters.${name}.protocolVersion`,
      );
    }

    adapters[name] = parsed;
  }

  return { version: 1, adapters };
}

export async function loadHarnessConfig(path: string): Promise<HarnessConfig> {
  return parseHarnessConfig(JSON.parse(await readFile(path, "utf8")) as unknown);
}
