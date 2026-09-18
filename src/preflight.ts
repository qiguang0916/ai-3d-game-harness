import { resolve } from "node:path";
import {
  buildActionAdapters,
  closeActionAdapters,
} from "./adapters/factory.js";
import type { AdapterHealth } from "./adapters/types.js";
import { loadHarnessConfig } from "./config.js";
import { loadTaskContracts } from "./core/contracts.js";
import { assertTaskGraph } from "./core/task-graph.js";

export interface PreflightIssue {
  code:
    | "missing-execution"
    | "missing-adapter"
    | "unsupported-action"
    | "adapter-unhealthy";
  message: string;
  taskId?: string;
  stepId?: string;
  adapter?: string;
}

export interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
  adapterHealth: AdapterHealth[];
}

export async function preflightProject(
  contractsDir: string,
  configPath: string,
): Promise<PreflightResult> {
  const contracts = await loadTaskContracts(resolve(contractsDir));
  assertTaskGraph(contracts);
  const config = await loadHarnessConfig(resolve(configPath));
  const adapters = buildActionAdapters(config);
  const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  const issues: PreflightIssue[] = [];

  for (const task of contracts) {
    if (!task.execution || task.execution.steps.length === 0) {
      issues.push({
        code: "missing-execution",
        taskId: task.id,
        message: `Task ${task.id} has no execution plan.`,
      });
      continue;
    }

    for (const step of task.execution.steps) {
      const adapter = byId.get(step.adapter);
      if (!adapter) {
        issues.push({
          code: "missing-adapter",
          taskId: task.id,
          stepId: step.id,
          adapter: step.adapter,
          message: `Task ${task.id} step ${step.id} references missing adapter ${step.adapter}.`,
        });
        continue;
      }

      if (!adapter.supportsAction(step.action)) {
        issues.push({
          code: "unsupported-action",
          taskId: task.id,
          stepId: step.id,
          adapter: step.adapter,
          message: `Adapter ${step.adapter} does not support action ${step.action} required by ${task.id}/${step.id}.`,
        });
      }
    }
  }

  let adapterHealth: AdapterHealth[] = [];
  try {
    adapterHealth = await Promise.all(
      adapters.map((adapter) => adapter.healthcheck()),
    );
    for (const health of adapterHealth) {
      if (!health.ok) {
        issues.push({
          code: "adapter-unhealthy",
          adapter: health.adapter,
          message: `Adapter ${health.adapter} failed healthcheck: ${JSON.stringify(health.details)}`,
        });
      }
    }
  } finally {
    await closeActionAdapters(adapters);
  }

  return {
    ok: issues.length === 0,
    issues,
    adapterHealth,
  };
}
