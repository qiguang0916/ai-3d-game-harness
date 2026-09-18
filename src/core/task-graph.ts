import type { ProjectState, TaskContract } from "./types.js";

export class TaskGraphError extends Error {}

export function assertTaskGraph(contracts: TaskContract[]): void {
  const byId = new Map(contracts.map((task) => [task.id, task]));

  if (byId.size !== contracts.length) {
    throw new TaskGraphError("Duplicate task IDs are not allowed.");
  }

  for (const task of contracts) {
    for (const dependency of task.dependencies) {
      if (!byId.has(dependency)) {
        throw new TaskGraphError(
          `Task ${task.id} depends on missing task ${dependency}.`,
        );
      }
      if (dependency === task.id) {
        throw new TaskGraphError(`Task ${task.id} cannot depend on itself.`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new TaskGraphError(`Dependency cycle detected at task ${id}.`);
    }
    if (visited.has(id)) return;

    visiting.add(id);
    const task = byId.get(id);
    if (!task) {
      throw new TaskGraphError(`Missing task ${id} while traversing graph.`);
    }
    for (const dependency of task.dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };

  for (const task of contracts) visit(task.id);
}

export function readyTasks(
  contracts: TaskContract[],
  state: ProjectState,
): TaskContract[] {
  assertTaskGraph(contracts);

  return contracts.filter((task) => {
    const runtime = state.tasks[task.id];
    if (
      runtime?.status === "done" ||
      runtime?.status === "running" ||
      runtime?.status === "failed" ||
      runtime?.status === "blocked"
    ) {
      return false;
    }

    return task.dependencies.every(
      (dependency) => state.tasks[dependency]?.status === "done",
    );
  });
}
