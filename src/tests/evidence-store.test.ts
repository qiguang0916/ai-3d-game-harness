import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonEvidenceStore } from "../evidence/store.js";
import type { EvidenceRecord } from "../core/types.js";

test("evidence store persists and de-duplicates records by ID", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai3d-evidence-"));
  try {
    const store = new JsonEvidenceStore(root);
    const record: EvidenceRecord = {
      id: "E1",
      taskId: "T1",
      criterionId: "A01",
      type: "test",
      outcome: "pass",
      summary: "passed",
      capturedAt: new Date(0).toISOString(),
    };

    await store.appendMany([record, record]);
    const loaded = await store.loadTask("T1");
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0]?.id, "E1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
