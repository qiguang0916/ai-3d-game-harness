import type { Orchestrator, RunResult } from "./orchestrator.js";
import type {
  EvidenceRecord,
  ProjectState,
  TaskContract,
} from "./types.js";
import type { JsonEvidenceStore } from "../evidence/store.js";
import type { RepairProvider, RepairResult } from "../repair/types.js";

export interface TaskRunSummary {
  taskId: string;
  passed: boolean;
  attempts: number;
  repairs: number;
}

export interface TaskRunResult extends RunResult {
  repairs: RepairResult[];
  summary: TaskRunSummary;
}

export class TaskRunner {
  constructor(
    private readonly projectRoot: string,
    private readonly orchestrator: Orchestrator,
    private readonly evidenceStore: JsonEvidenceStore,
    private readonly repairProvider?: RepairProvider,
  ) {}

  async run(
    task: TaskContract,
    state: ProjectState,
    autoRepair: boolean,
  ): Promise<TaskRunResult> {
    const repairs: RepairResult[] = [];

    while (true) {
      const priorEvidence = await this.evidenceStore.loadTask(task.id);
      const result = await this.orchestrator.runTask(
        task,
        state,
        priorEvidence,
      );
      await this.persistFreshEvidence(priorEvidence, result.evidence);

      const runtime = state.tasks[task.id];
      if (result.gate.passed) {
        return {
          ...result,
          repairs,
          summary: {
            taskId: task.id,
            passed: true,
            attempts: runtime?.attempts ?? 0,
            repairs: repairs.length,
          },
        };
      }

      if (
        !autoRepair ||
        !this.repairProvider ||
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
            repairs: repairs.length,
          },
        };
      }

      const repair = await this.repairProvider.repair({
        projectRoot: this.projectRoot,
        task,
        gate: result.gate,
        evidence: result.evidence,
        state,
      });
      repairs.push(repair);
    }
  }

  private async persistFreshEvidence(
    prior: EvidenceRecord[],
    current: EvidenceRecord[],
  ): Promise<void> {
    const priorIds = new Set(prior.map((record) => record.id));
    await this.evidenceStore.appendMany(
      current.filter((record) => !priorIds.has(record.id)),
    );
  }
}
