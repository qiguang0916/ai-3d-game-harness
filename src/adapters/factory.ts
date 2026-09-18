import type { HarnessConfig } from "../config.js";
import type { ActionAdapter } from "./action.js";
import { McpActionAdapter } from "./mcp-action.js";

export function buildActionAdapters(config: HarnessConfig): ActionAdapter[] {
  return Object.entries(config.adapters).map(
    ([name, adapter]) => new McpActionAdapter(name, adapter),
  );
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
