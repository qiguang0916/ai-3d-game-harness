import type { ProjectState, TaskContract } from "../core/types.js";
import type { HarnessAdapter } from "./types.js";

export class MockPassAdapter implements HarnessAdapter {
  readonly name = "mock-pass";

  supports(): boolean {
    return true;
  }

  async healthcheck() {
    return {
      ok: true,
      adapter: this.name,
      details: { mode: "test" },
    };
  }

  async describeCapabilities() {
    return {
      taskKinds: ["generic"] as TaskContract["kind"][],
      capabilities: ["emit-required-pass-evidence"],
    };
  }

  async execute(task: TaskContract, _state: ProjectState) {
    return {
      evidence: task.acceptanceCriteria.flatMap((criterion) =>
        criterion.requiredEvidence.map((type, index) => ({
          id: `${task.id}-${criterion.id}-${type}-${index}`,
          taskId: task.id,
          criterionId: criterion.id,
          type,
          outcome: "pass" as const,
          summary: `Mock evidence for ${criterion.description}`,
          capturedAt: new Date().toISOString(),
        })),
      ),
    };
  }
}
