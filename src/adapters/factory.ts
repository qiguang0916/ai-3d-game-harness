import type { HarnessConfig } from "../config.js";
import type { ActionAdapter } from "./action.js";
import { JsonProcessActionAdapter } from "./json-process-action.js";
import { McpActionAdapter } from "./mcp-action.js";
import { QaFileActionAdapter } from "./qa-file.js";

export function buildActionAdapters(config: HarnessConfig): ActionAdapter[] {
  return Object.entries(config.adapters).map(([name, adapter]) => {
    if (adapter.type === "mcp-stdio") {
      return new McpActionAdapter(name, adapter);
    }
    if (adapter.type === "qa-file") {
      return new QaFileActionAdapter(name, adapter);
    }
    return new JsonProcessActionAdapter(name, adapter);
  });
}

export async function closeActionAdapters(
  adapters: ActionAdapter[],
): Promise<void> {
  await Promise.all(
    adapters.map(async (adapter) => {
      if (adapter.close) await adapter.close();
    }),
  );
}
