import { join, resolve } from "node:path";
import { buildActionAdapters, closeActionAdapters } from "./adapters/factory.js";
import { loadHarnessConfig } from "./config.js";
import { loadTaskContract } from "./core/contracts.js";
import { Orchestrator } from "./core/orchestrator.js";
import { PipelineTaskExecutor } from "./core/pipeline-executor.js";
import { JsonStateStore } from "./core/state-store.js";
import type {
  ProjectState,
  TaskContract,
} from "./core/types.js";
import { JsonEvidenceStore } from "./evidence/store.js";
import { buildRepairProvider } from "./repair/factory.js";
import type { RepairResult } from "./repair/types.js";

const ensureTaskState = (
  state: ProjectState,
  task: TaskContract,
): ProjectState => {
  if (!state.tasks[task.id]) {
    state.tasks[task.id] = {
      taskId: task.id,
      status: "pending",
      attempts: 0,
      evidenceIds: [],
    };
  }
  return state;
};

export interface RunContractOptions {
  projectRoot: string;
  contractPath: string;
  configPath: string;
}

export interface ContractRunSummary {
  taskId: string;
  passed: boolean;
  attempts: number;
  repairs: RepairResult[];
}

const executeContract = async (
  options: RunContractOptions,
  autoRepair: boolean,
) => {
  const projectRoot = resolve(options.projectRoot);
  const task = await loadTaskContract(resolve(options.contractPath));
  const config = await loadHarnessConfig(resolve(options.configPath));
  const stateStore = new JsonStateStore(join(projectRoot, ".project", "state.json"));
  const evidenceStore = new JsonEvidenceStore(
    join(projectRoot, ".project", "evidence"),
  );

  let state: ProjectState;
  try {
    state = await stateStore.load();
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      state = { version: 1, tasks: {} };
    } else {
      throw error;
    }
  }
  ensureTaskState(state, task);
  await stateStore.save(state);

  const adapters = buildActionAdapters(config);
  const repairProvider = autoRepair ? buildRepairProvider(config) : undefined;
  const repairs: RepairResult[] = [];

  try {
    const executor = new PipelineTaskExecutor(adapters);
    const orchestrator = new Orchestrator([executor], stateStore);

    while (true) {
      const priorEvidence = await evidenceStore.loadTask(task.id);
      const result = await orchestrator.runTask(task, state, priorEvidence);
      const priorIds = new Set(priorEvidence.map((record) => record.id));
      const freshEvidence = result.evidence.filter(
        (record) => !priorIds.has(record.id),
      );
      await evidenceStore.appendMany(freshEvidence);

      if (result.gate.passed) {
        return {
          ...result,
          repairs,
          summary: {
            taskId: task.id,
            passed: true,
            attempts: state.tasks[task.id]?.attempts ?? 0,
            repairs,
          } satisfies ContractRunSummary,
        };
      }

      const runtime = state.tasks[task.id];
      if (
        !autoRepair ||
        !repairProvider ||
        !runtime ||
        runtime.attempts >= task.maxAttempts
      ) {
        return {
          ...result,
          repairs,
          summary: {
            taskId: task.id,
            passed: false,
            attempts: runtime?.attempts ?? 0,
            repairs,
          } satisfies ContractRunSummary,
        };
      }

      const repair = await repairProvider.repair({
        projectRoot,
        task,
        gate: result.gate,
        evidence: result.evidence,
        state,
      });
      repairs.push(repair);
    }
  } finally {
    await closeActionAdapters(adapters);
  }
};

export async function runContract(options: RunContractOptions) {
  return executeContract(options, false);
}

export async function runContractAuto(options: RunContractOptions) {
  return executeContract(options, true);
}

export async function doctorConfig(configPath: string) {
  const config = await loadHarnessConfig(resolve(configPath));
  const adapters = buildActionAdapters(config);
  try {
    return await Promise.all(adapters.map((adapter) => adapter.healthcheck()));
  } finally {
    await closeActionAdapters(adapters);
  }
}
