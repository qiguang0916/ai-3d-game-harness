import type {
  CriterionGateResult,
  EvidenceRecord,
  TaskContract,
  TaskGateResult,
} from "./types.js";

export function latestAttemptEvidence(
  taskId: string,
  evidence: EvidenceRecord[],
): EvidenceRecord[] {
  const taskEvidence = evidence.filter((item) => item.taskId === taskId);
  if (taskEvidence.length === 0) return [];

  const latestAttempt = Math.max(
    ...taskEvidence.map((item) => item.attempt ?? 0),
  );

  return taskEvidence.filter(
    (item) => (item.attempt ?? 0) === latestAttempt,
  );
}

export function evaluateTaskGate(
  task: TaskContract,
  evidence: EvidenceRecord[],
): TaskGateResult {
  const taskEvidence = latestAttemptEvidence(task.id, evidence);

  const criteria: CriterionGateResult[] = task.acceptanceCriteria.map(
    (criterion) => {
      const matching = taskEvidence.filter(
        (item) => item.criterionId === criterion.id,
      );
      const failing = matching.filter((item) => item.outcome === "fail");
      const passing = matching.filter((item) => item.outcome === "pass");

      const missingEvidence = criterion.requiredEvidence.filter(
        (type) => !passing.some((item) => item.type === type),
      );

      return {
        criterionId: criterion.id,
        passed: failing.length === 0 && missingEvidence.length === 0,
        missingEvidence,
        failingEvidenceIds: failing.map((item) => item.id),
        passingEvidenceIds: passing.map((item) => item.id),
      };
    },
  );

  return {
    taskId: task.id,
    passed: criteria.every((criterion) => criterion.passed),
    criteria,
  };
}
