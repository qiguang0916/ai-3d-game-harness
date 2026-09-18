import { readFile } from "node:fs/promises";

export type McpCheckOperator =
  | "equals"
  | "not-equals"
  | "exists"
  | "empty"
  | "not-empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "includes";

export interface McpResultCheck {
  path: string;
  operator: McpCheckOperator;
  value?: unknown;
}

export interface McpActionMapping {
  tool: string;
  defaultArguments?: Record<string, unknown>;
  successPath?: string;
  uriPath?: string;
  failureTextIncludes?: string[];
  checks?: McpResultCheck[];
}

export interface ProcessBaseConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface McpStdioAdapterConfig extends ProcessBaseConfig {
  type: "mcp-stdio";
  protocolVersion?: string;
  actions: Record<string, McpActionMapping>;
}

export interface JsonProcessActionAdapterConfig extends ProcessBaseConfig {
  type: "json-process";
  actions: string[];
}

export type ActionAdapterConfig =
  | McpStdioAdapterConfig
  | JsonProcessActionAdapterConfig;

export interface JsonProcessRepairConfig extends ProcessBaseConfig {
  type: "json-process";
}

export interface HarnessConfig {
  version: 1;
  adapters: Record<string, ActionAdapterConfig>;
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

const applyProcessFields = <T extends ProcessBaseConfig>(
  target: T,
  raw: Record<string, unknown>,
  label: string,
): T => {
  if (raw.args !== undefined) {
    target.args = parseStringArray(raw.args, `${label}.args`);
  }
  if (raw.cwd !== undefined) {
    target.cwd = asString(raw.cwd, `${label}.cwd`);
  }
  if (raw.env !== undefined) {
    target.env = parseEnv(raw.env, `${label}.env`);
  }
  if (raw.timeoutMs !== undefined) {
    target.timeoutMs = parseTimeout(raw.timeoutMs, `${label}.timeoutMs`);
  }
  return target;
};

const checkOperators = new Set<McpCheckOperator>([
  "equals",
  "not-equals",
  "exists",
  "empty",
  "not-empty",
  "gt",
  "gte",
  "lt",
  "lte",
  "includes",
]);

const parseMcpCheck = (value: unknown, label: string): McpResultCheck => {
  const raw = asRecord(value, label);
  const path = asString(raw.path, `${label}.path`);
  const operator = asString(raw.operator, `${label}.operator`);
  if (!checkOperators.has(operator as McpCheckOperator)) {
    throw new Error(`${label}.operator is invalid: ${operator}`);
  }

  const check: McpResultCheck = {
    path,
    operator: operator as McpCheckOperator,
  };
  if (raw.value !== undefined) check.value = raw.value;
  return check;
};

const parseMcpAdapter = (
  raw: Record<string, unknown>,
  label: string,
): McpStdioAdapterConfig => {
  const actionsRaw = asRecord(raw.actions, `${label}.actions`);
  const actions: Record<string, McpActionMapping> = {};

  for (const [actionName, mappingValue] of Object.entries(actionsRaw)) {
    const mapping = asRecord(
      mappingValue,
      `${label}.actions.${actionName}`,
    );
    const parsed: McpActionMapping = {
      tool: asString(
        mapping.tool,
        `${label}.actions.${actionName}.tool`,
      ),
    };
    if (mapping.defaultArguments !== undefined) {
      parsed.defaultArguments = asRecord(
        mapping.defaultArguments,
        `${label}.actions.${actionName}.defaultArguments`,
      );
    }
    if (mapping.successPath !== undefined) {
      parsed.successPath = asString(
        mapping.successPath,
        `${label}.actions.${actionName}.successPath`,
      );
    }
    if (mapping.uriPath !== undefined) {
      parsed.uriPath = asString(
        mapping.uriPath,
        `${label}.actions.${actionName}.uriPath`,
      );
    }
    if (mapping.failureTextIncludes !== undefined) {
      parsed.failureTextIncludes = parseStringArray(
        mapping.failureTextIncludes,
        `${label}.actions.${actionName}.failureTextIncludes`,
      );
    }
    if (mapping.checks !== undefined) {
      if (!Array.isArray(mapping.checks)) {
        throw new Error(
          `${label}.actions.${actionName}.checks must be an array.`,
        );
      }
      parsed.checks = mapping.checks.map((check, index) =>
        parseMcpCheck(
          check,
          `${label}.actions.${actionName}.checks[${index}]`,
        ),
      );
    }
    actions[actionName] = parsed;
  }

  const parsed = applyProcessFields<McpStdioAdapterConfig>(
    {
      type: "mcp-stdio",
      command: asString(raw.command, `${label}.command`),
      actions,
    },
    raw,
    label,
  );

  if (raw.protocolVersion !== undefined) {
    parsed.protocolVersion = asString(
      raw.protocolVersion,
      `${label}.protocolVersion`,
    );
  }
  return parsed;
};

const parseJsonProcessAdapter = (
  raw: Record<string, unknown>,
  label: string,
): JsonProcessActionAdapterConfig =>
  applyProcessFields<JsonProcessActionAdapterConfig>(
    {
      type: "json-process",
      command: asString(raw.command, `${label}.command`),
      actions: parseStringArray(raw.actions, `${label}.actions`),
    },
    raw,
    label,
  );

export function parseHarnessConfig(value: unknown): HarnessConfig {
  const raw = asRecord(value, "config");
  if (raw.version !== 1) throw new Error("config.version must be 1.");

  const adaptersRaw = asRecord(raw.adapters, "config.adapters");
  const adapters: Record<string, ActionAdapterConfig> = {};

  for (const [name, adapterValue] of Object.entries(adaptersRaw)) {
    const label = `config.adapters.${name}`;
    const adapter = asRecord(adapterValue, label);

    if (adapter.type === "mcp-stdio") {
      adapters[name] = parseMcpAdapter(adapter, label);
    } else if (adapter.type === "json-process") {
      adapters[name] = parseJsonProcessAdapter(adapter, label);
    } else {
      throw new Error(
        `${label}.type must be "mcp-stdio" or "json-process".`,
      );
    }
  }

  const result: HarnessConfig = { version: 1, adapters };

  if (raw.repair !== undefined) {
    const repair = asRecord(raw.repair, "config.repair");
    if (repair.type !== "json-process") {
      throw new Error('config.repair.type must be "json-process".');
    }

    result.repair = applyProcessFields<JsonProcessRepairConfig>(
      {
        type: "json-process",
        command: asString(repair.command, "config.repair.command"),
      },
      repair,
      "config.repair",
    );
  }

  return result;
}

export async function loadHarnessConfig(path: string): Promise<HarnessConfig> {
  return parseHarnessConfig(JSON.parse(await readFile(path, "utf8")) as unknown);
}
