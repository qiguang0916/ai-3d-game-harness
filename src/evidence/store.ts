import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvidenceRecord } from "../core/types.js";

const safeTaskId = (taskId: string): string => {
  if (!/^[A-Za-z0-9._-]+$/.test(taskId)) {
    throw new Error(`Unsafe task ID for evidence path: ${taskId}`);
  }
  return taskId;
};

export class JsonEvidenceStore {
  constructor(private readonly rootDirectory: string) {}

  private filePath(taskId: string): string {
    return join(this.rootDirectory, `${safeTaskId(taskId)}.json`);
  }

  async loadTask(taskId: string): Promise<EvidenceRecord[]> {
    try {
      const raw = await readFile(this.filePath(taskId), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error(`Evidence file for ${taskId} must contain an array.`);
      }
      return parsed as EvidenceRecord[];
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }
  }

  async saveTask(taskId: string, evidence: EvidenceRecord[]): Promise<void> {
    await mkdir(this.rootDirectory, { recursive: true });
    const path = this.filePath(taskId);
    const temporary = `${path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  }

  async appendMany(records: EvidenceRecord[]): Promise<void> {
    const grouped = new Map<string, EvidenceRecord[]>();
    for (const record of records) {
      const current = grouped.get(record.taskId) ?? [];
      current.push(record);
      grouped.set(record.taskId, current);
    }

    for (const [taskId, additions] of grouped) {
      const existing = await this.loadTask(taskId);
      const byId = new Map(existing.map((item) => [item.id, item]));
      for (const item of additions) byId.set(item.id, item);
      await this.saveTask(taskId, [...byId.values()]);
    }
  }
}
