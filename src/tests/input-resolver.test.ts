import test from "node:test";
import assert from "node:assert/strict";
import { resolveStepInput } from "../core/input-resolver.js";

test("runtime input references resolve prior step outputs recursively", () => {
  const input = resolveStepInput(
    {
      job_id: {
        $from: "steps.start.metadata.structuredContent.data.job_id",
      },
      nested: [
        {
          root: { $from: "projectRoot" },
        },
      ],
    },
    {
      projectRoot: "/tmp/game",
      task: { id: "T1" },
      steps: {
        start: {
          metadata: {
            structuredContent: {
              data: {
                job_id: "job-123",
              },
            },
          },
        },
      },
    },
  );

  assert.deepEqual(input, {
    job_id: "job-123",
    nested: [{ root: "/tmp/game" }],
  });
});

test("runtime input references fail loudly when a path is missing", () => {
  assert.throws(
    () =>
      resolveStepInput(
        {
          job_id: { $from: "steps.start.metadata.job_id" },
        },
        {
          projectRoot: "/tmp/game",
          task: { id: "T1" },
          steps: {},
        },
      ),
    /did not resolve/,
  );
});
