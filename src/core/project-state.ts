import type { ProjectState, TaskContract } from "./types.js";

export function syncProjectState(
  contracts: TaskContract[],
  state: ProjectState,
): ProjectState {
  for (const task of contracts) {
    if (!state.tasks[task.id]) {
      state.tasks[task.id] = {
        taskId: task.id,
        status: "pending",
        attempts: 0,
        evidenceIds: [],
      };
    }
  }
  return state;
}

export function markDependencyBlockedTasks(
  contracts: TaskContract[],
  state: ProjectState,
): boolean {
  let changed = false;
  let passChanged = true;

  while (passChanged) {
    passChanged = false;
    for (const task of contracts) {
      const runtime = state.tasks[task.id];
      if (!runtime || runtime.status !== "pending") continue;

      const blocker = task.dependencies.find((dependency) => {
        const dependencyStatus = state.tasks[dependency]?.status;
        return dependencyStatus === "failed" || dependencyStatus === "blocked";
      });

      if (blocker) {
        runtime.status = "blocked";
        runtime.lastError = `Dependency ${blocker} did not complete successfully.`;
        changed = true;
        passChanged = true;
      }
    }
  }

  return changed;
}
