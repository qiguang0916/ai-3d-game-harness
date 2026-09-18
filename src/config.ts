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

export interface JsonProcessRepairConfig {
  type: "json-process";
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface HarnessConfig {
  version: 1;
  adapters: Record<string, McpStdioAdapterConfig>;
  repair?: JsonProcessRepairConfig;
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

const parseStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be a string array.`);
  }
  return [...value] as string[];
};

const parseEnv = (
  value: unknown,
  label: string,
): Record<string, string> => {
  const raw = asRecord(value, label);
  return Object.fromEntries(
    Object.entries(raw).map(([key, val]) => [
      key,
      asString(val, `${label}.${key}`),
    ]),
  );
};

const parseTimeout = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
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
      parsed.args = parseStringArray(
        adapter.args,
        `config.adapters.${name}.args`,
      );
    }
    if (adapter.cwd !== undefined) {
      parsed.cwd = asString(adapter.cwd, `config.adapters.${name}.cwd`);
    }
    if (adapter.env !== undefined) {
      parsed.env = parseEnv(adapter.env, `config.adapters.${name}.env`);
    }
    if (adapter.timeoutMs !== undefined) {
      parsed.timeoutMs = parseTimeout(
        adapter.timeoutMs,
        `config.adapters.${name}.timeoutMs`,
      );
    }
    if (adapter.protocolVersion !== undefined) {
      parsed.protocolVersion = asString(
        adapter.protocolVersion,
        `config.adapters.${name}.protocolVersion`,
      );
    }

    adapters[name] = parsed;
  }

  const result: HarnessConfig = { version: 1, adapters };

  if (raw.repair !== undefined) {
    const repair = asRecord(raw.repair, "config.repair");
    if (repair.type !== "json-process") {
      throw new Error('config.repair.type must be "json-process".');
    }

    const parsed: JsonProcessRepairConfig = {
      type: "json-process",
      command: asString(repair.command, "config.repair.command"),
    };

    if (repair.args !== undefined) {
      parsed.args = parseStringArray(repair.args, "config.repair.args");
    }
    if (repair.cwd !== undefined) {
      parsed.cwd = asString(repair.cwd, "config.repair.cwd");
    }
    if (repair.env !== undefined) {
      parsed.env = parseEnv(repair.env, "config.repair.env");
    }
    if (repair.timeoutMs !== undefined) {
      parsed.timeoutMs = parseTimeout(
        repair.timeoutMs,
        "config.repair.timeoutMs",
      );
    }

    result.repair = parsed;
  }

  return result;
}

export async function loadHarnessConfig(path: string): Promise<HarnessConfig> {
  return parseHarnessConfig(JSON.parse(await readFile(path, "utf8")) as unknown);
}
