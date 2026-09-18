import type { ActionAdapter } from "../adapters/action.js";
import type {
  EvidenceRecord,
  ExecutorResult,
  ProjectState,
  TaskContract,
  TaskExecutor,
} from "./types.js";

export class PipelineTaskExecutor implements TaskExecutor {
  readonly name = "pipeline";

  private readonly byId: Map<string, ActionAdapter>;

  constructor(adapters: ActionAdapter[]) {
    this.byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  }

  supports(task: TaskContract): boolean {
    const steps = task.execution?.steps;
    if (!steps || steps.length === 0) return false;
    return steps.every((step) => {
      const adapter = this.byId.get(step.adapter);
      return adapter?.supportsAction(step.action) === true;
    });
  }

  async execute(
    task: TaskContract,
    state: ProjectState,
  ): Promise<ExecutorResult> {
    const plan = task.execution;
    if (!plan) {
      throw new Error(`Task ${task.id} has no execution plan.`);
    }

    const evidence: EvidenceRecord[] = [];
    const runtime = state.tasks[task.id];
    const attempt = runtime?.attempts ?? 0;

    for (const step of plan.steps) {
      const adapter = this.byId.get(step.adapter);
      if (!adapter) {
        throw new Error(
          `Task ${task.id} references missing adapter ${step.adapter}.`,
        );
      }
      if (!adapter.supportsAction(step.action)) {
        throw new Error(
          `Adapter ${step.adapter} does not support action ${step.action}.`,
        );
      }

      const result = await adapter.executeAction(
        step.action,
        step.input ?? {},
        { task, step, state },
      );

      const record: EvidenceRecord = {
        id: `${task.id}:${step.id}:attempt-${attempt}`,
        taskId: task.id,
        criterionId: step.criterionId,
        type: step.evidenceType,
        outcome: result.outcome,
        summary: result.summary,
        capturedAt: new Date().toISOString(),
      };
      if (result.uri !== undefined) record.uri = result.uri;
      if (result.metadata !== undefined) record.metadata = result.metadata;
      evidence.push(record);

      if (result.outcome === "fail" && step.continueOnFailure !== true) {
        break;
      }
    }

    return { evidence };
  }
}
