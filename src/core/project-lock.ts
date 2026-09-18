import {
  mkdir,
  open,
  readFile,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { dirname, join } from "node:path";

export interface ProjectLockInfo {
  pid: number;
  createdAt: string;
}

export class ProjectLock {
  private released = false;

  private constructor(
    private readonly path: string,
    private readonly handle: FileHandle,
  ) {}

  static async acquire(projectRoot: string): Promise<ProjectLock> {
    const path = join(projectRoot, ".project", "harness.lock");
    await mkdir(dirname(path), { recursive: true });

    try {
      const handle = await open(path, "wx");
      const info: ProjectLockInfo = {
        pid: process.pid,
        createdAt: new Date().toISOString(),
      };
      await handle.writeFile(`${JSON.stringify(info, null, 2)}\n`, "utf8");
      return new ProjectLock(path, handle);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EEXIST"
      ) {
        let details = "";
        try {
          details = (await readFile(path, "utf8")).trim();
        } catch {
          details = "lock metadata unavailable";
        }
        throw new Error(
          `Harness project is already locked at ${path}. ${details}`,
        );
      }
      throw error;
    }
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await this.handle.close();
    try {
      await unlink(this.path);
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          (error as NodeJS.ErrnoException).code === "ENOENT"
        )
      ) {
        throw error;
      }
    }
  }
}
