import { evaluateTaskGate } from "./gates.js";
import type {
  EvidenceRecord,
  ProjectState,
  TaskContract,
  TaskExecutor,
  TaskGateResult,
} from "./types.js";

export interface StateSink {
  save(state: ProjectState): Promise<void>;
}

export interface RunResult {
  taskId: string;
  gate: TaskGateResult;
  evidence: EvidenceRecord[];
  state: ProjectState;
}

export class Orchestrator {
  constructor(
    private readonly executors: TaskExecutor[],
    private readonly stateSink: StateSink,
  ) {}

  async runTask(
    task: TaskContract,
    state: ProjectState,
    priorEvidence: EvidenceRecord[] = [],
  ): Promise<RunResult> {
    const runtime = state.tasks[task.id];
    if (!runtime) {
      throw new Error(`Task ${task.id} is missing from project state.`);
    }

    const unfinishedDependency = task.dependencies.find(
      (dependency) => state.tasks[dependency]?.status !== "done",
    );
    if (unfinishedDependency) {
      runtime.status = "blocked";
      runtime.lastError = `Dependency ${unfinishedDependency} is not done.`;
      await this.stateSink.save(state);
      throw new Error(runtime.lastError);
    }

    if (runtime.attempts >= task.maxAttempts) {
      runtime.status = "failed";
      runtime.lastError = `Maximum attempts reached (${task.maxAttempts}).`;
      await this.stateSink.save(state);
      throw new Error(runtime.lastError);
    }

    const executor = this.executors.find((candidate) => candidate.supports(task));
    if (!executor) {
      runtime.status = "blocked";
      runtime.lastError = `No executor supports task kind ${task.kind}.`;
      await this.stateSink.save(state);
      throw new Error(runtime.lastError);
    }

    runtime.status = "running";
    runtime.attempts += 1;
    runtime.lastStartedAt = new Date().toISOString();
    delete runtime.lastError;
    await this.stateSink.save(state);

    try {
      const result = await executor.execute(task, state);
      const evidence = [...priorEvidence, ...result.evidence];
      const gate = evaluateTaskGate(task, evidence);

      runtime.evidenceIds = Array.from(
        new Set([...runtime.evidenceIds, ...result.evidence.map((item) => item.id)]),
      );
      runtime.lastFinishedAt = new Date().toISOString();
      runtime.status = gate.passed ? "done" : "failed";

      if (!gate.passed) {
        const missing = gate.criteria
          .filter((criterion) => !criterion.passed)
          .map((criterion) => criterion.criterionId)
          .join(", ");
        runtime.lastError = `Quality gate failed: ${missing}`;
      } else {
        delete runtime.lastError;
      }

      await this.stateSink.save(state);
      return { taskId: task.id, gate, evidence, state };
    } catch (error) {
      runtime.status = "failed";
      runtime.lastFinishedAt = new Date().toISOString();
      runtime.lastError =
        error instanceof Error ? error.message : "Unknown executor failure.";
      await this.stateSink.save(state);
      throw error;
    }
  }
}
