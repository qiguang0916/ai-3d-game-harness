import { join, resolve } from "node:path";
import { buildActionAdapters, closeActionAdapters } from "./adapters/factory.js";
import { loadHarnessConfig } from "./config.js";
import {
  loadTaskContract,
  loadTaskContracts,
} from "./core/contracts.js";
import { Orchestrator } from "./core/orchestrator.js";
import { PipelineTaskExecutor } from "./core/pipeline-executor.js";
import {
  markDependencyBlockedTasks,
  syncProjectState,
} from "./core/project-state.js";
import { JsonStateStore } from "./core/state-store.js";
import { TaskRunner, type TaskRunResult } from "./core/task-runner.js";
import { assertTaskGraph, readyTasks } from "./core/task-graph.js";
import type { ProjectState, TaskContract } from "./core/types.js";
import { JsonEvidenceStore } from "./evidence/store.js";
import { buildRepairProvider } from "./repair/factory.js";

export interface RunContractOptions {
  projectRoot: string;
  contractPath: string;
  configPath: string;
}

export interface RunProjectOptions {
  projectRoot: string;
  contractsDir: string;
  configPath: string;
  autoRepair?: boolean;
}

export interface ProjectRunError {
  taskId: string;
  message: string;
}

export interface ProjectRunResult {
  passed: boolean;
  taskRuns: TaskRunResult[];
  errors: ProjectRunError[];
  state: ProjectState;
}

const loadState = async (stateStore: JsonStateStore): Promise<ProjectState> => {
  try {
    return await stateStore.load();
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return { version: 1, tasks: {} };
    }
    throw error;
  }
};

const buildRunner = (
  projectRoot: string,
  stateStore: JsonStateStore,
  evidenceStore: JsonEvidenceStore,
  config: Awaited<ReturnType<typeof loadHarnessConfig>>,
) => {
  const adapters = buildActionAdapters(config);
  const executor = new PipelineTaskExecutor(adapters, projectRoot);
  const orchestrator = new Orchestrator([executor], stateStore);
  const repairProvider = buildRepairProvider(config);
  const runner = new TaskRunner(
    projectRoot,
    orchestrator,
    evidenceStore,
    repairProvider,
  );
  return { adapters, runner };
};

const executeContract = async (
  options: RunContractOptions,
  autoRepair: boolean,
) => {
  const projectRoot = resolve(options.projectRoot);
  const task = await loadTaskContract(resolve(options.contractPath));
  const config = await loadHarnessConfig(resolve(options.configPath));
  const stateStore = new JsonStateStore(
    join(projectRoot, ".project", "state.json"),
  );
  const evidenceStore = new JsonEvidenceStore(
    join(projectRoot, ".project", "evidence"),
  );

  const state = syncProjectState([task], await loadState(stateStore));
  await stateStore.save(state);

  const { adapters, runner } = buildRunner(
    projectRoot,
    stateStore,
    evidenceStore,
    config,
  );
  try {
    return await runner.run(task, state, autoRepair);
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

export async function runProject(
  options: RunProjectOptions,
): Promise<ProjectRunResult> {
  const projectRoot = resolve(options.projectRoot);
  const contracts = await loadTaskContracts(resolve(options.contractsDir));
  assertTaskGraph(contracts);

  const config = await loadHarnessConfig(resolve(options.configPath));
  const stateStore = new JsonStateStore(
    join(projectRoot, ".project", "state.json"),
  );
  const evidenceStore = new JsonEvidenceStore(
    join(projectRoot, ".project", "evidence"),
  );

  const state = syncProjectState(contracts, await loadState(stateStore));
  await stateStore.save(state);

  const { adapters, runner } = buildRunner(
    projectRoot,
    stateStore,
    evidenceStore,
    config,
  );
  const taskRuns: TaskRunResult[] = [];
  const errors: ProjectRunError[] = [];

  try {
    while (true) {
      const ready = readyTasks(contracts, state);
      if (ready.length === 0) break;

      for (const task of ready) {
        try {
          const result = await runner.run(
            task,
            state,
            options.autoRepair === true,
          );
          taskRuns.push(result);
          if (!result.gate.passed) {
            markDependencyBlockedTasks(contracts, state);
            await stateStore.save(state);
          }
        } catch (error) {
          errors.push({
            taskId: task.id,
            message: error instanceof Error ? error.message : String(error),
          });
          const runtime = state.tasks[task.id];
          if (runtime && runtime.status !== "blocked") {
            runtime.status = "failed";
            runtime.lastError =
              error instanceof Error ? error.message : String(error);
          }
          markDependencyBlockedTasks(contracts, state);
          await stateStore.save(state);
        }
      }
    }

    if (markDependencyBlockedTasks(contracts, state)) {
      await stateStore.save(state);
    }

    return {
      passed: contracts.every(
        (task) => state.tasks[task.id]?.status === "done",
      ),
      taskRuns,
      errors,
      state,
    };
  } finally {
    await closeActionAdapters(adapters);
  }
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
