import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectLock } from "../core/project-lock.js";

test("project lock prevents concurrent harness writers", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-lock-"));
  const first = await ProjectLock.acquire(root);
  try {
    await assert.rejects(
      () => ProjectLock.acquire(root),
      /already locked/,
    );
  } finally {
    await first.release();
    await rm(root, { recursive: true, force: true });
  }
});
