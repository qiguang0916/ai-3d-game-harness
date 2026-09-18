import type { HarnessConfig } from "../config.js";
import { JsonProcessRepairProvider } from "./process-repair.js";
import type { RepairProvider } from "./types.js";

export function buildRepairProvider(
  config: HarnessConfig,
): RepairProvider | undefined {
  if (!config.repair) return undefined;
  return new JsonProcessRepairProvider(config.repair);
}
