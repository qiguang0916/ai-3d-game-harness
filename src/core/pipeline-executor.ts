import type { ActionAdapter } from "../adapters/action.js";
import { resolveStepInput } from "./input-resolver.js";
import type {
  EvidenceRecord,
  ExecutorResult,
  ProjectState,
  TaskContract,
  TaskExecutor,
} from "./types.js";

interface StepOutput {
  outcome: "pass" | "fail" | "info";
  summary: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export class PipelineTaskExecutor implements TaskExecutor {
  readonly name = "pipeline";

  private readonly byId: Map<string, ActionAdapter>;

  constructor(
    adapters: ActionAdapter[],
    private readonly projectRoot = process.cwd(),
  ) {
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
    const stepOutputs: Record<string, StepOutput> = {};
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

      const input = resolveStepInput(step.input ?? {}, {
        projectRoot: this.projectRoot,
        task: task as unknown as Record<string, unknown>,
        steps: stepOutputs,
      });

      const result = await adapter.executeAction(
        step.action,
        input,
        { projectRoot: this.projectRoot, task, step, state },
      );

      const output: StepOutput = {
        outcome: result.outcome,
        summary: result.summary,
      };
      if (result.uri !== undefined) output.uri = result.uri;
      if (result.metadata !== undefined) output.metadata = result.metadata;
      stepOutputs[step.id] = output;

      const record: EvidenceRecord = {
        id: `${task.id}:${step.id}:attempt-${attempt}`,
        taskId: task.id,
        criterionId: step.criterionId,
        type: step.evidenceType,
        outcome: result.outcome,
        summary: result.summary,
        capturedAt: new Date().toISOString(),
        attempt,
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
