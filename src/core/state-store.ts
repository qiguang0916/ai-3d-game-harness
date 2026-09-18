import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ProjectState, TaskContract, TaskRuntimeState } from "./types.js";

export function initialTaskState(taskId: string): TaskRuntimeState {
  return {
    taskId,
    status: "pending",
    attempts: 0,
    evidenceIds: [],
  };
}

export function initialProjectState(contracts: TaskContract[]): ProjectState {
  return {
    version: 1,
    tasks: Object.fromEntries(
      contracts.map((task) => [task.id, initialTaskState(task.id)]),
    ),
  };
}

export class JsonStateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<ProjectState> {
    const raw = await readFile(this.filePath, "utf8");
    return JSON.parse(raw) as ProjectState;
  }

  async save(state: ProjectState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }
}
