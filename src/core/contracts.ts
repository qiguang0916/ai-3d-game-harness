import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  AcceptanceCriterion,
  EvidenceType,
  ExecutionStep,
  TaskContract,
  TaskExecutionPlan,
  TaskKind,
} from "./types.js";

const taskKinds = new Set<TaskKind>([
  "blender",
  "unity",
  "integration",
  "gameplay",
  "qa",
  "build",
  "generic",
]);

const evidenceTypes = new Set<EvidenceType>([
  "file",
  "log",
  "screenshot",
  "test",
  "profiler",
  "asset-report",
  "runtime-observation",
]);

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const asNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
};

const asStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item, index) =>
    asNonEmptyString(item, `${label}[${index}]`),
  );
};

const parseEvidenceType = (value: unknown, label: string): EvidenceType => {
  if (typeof value !== "string" || !evidenceTypes.has(value as EvidenceType)) {
    throw new Error(`${label} is invalid.`);
  }
  return value as EvidenceType;
};

const parseCriterion = (value: unknown, index: number): AcceptanceCriterion => {
  const raw = asRecord(value, `acceptanceCriteria[${index}]`);
  const requiredEvidenceRaw = raw.requiredEvidence;
  if (!Array.isArray(requiredEvidenceRaw)) {
    throw new Error(
      `acceptanceCriteria[${index}].requiredEvidence must be an array.`,
    );
  }

  return {
    id: asNonEmptyString(raw.id, `acceptanceCriteria[${index}].id`),
    description: asNonEmptyString(
      raw.description,
      `acceptanceCriteria[${index}].description`,
    ),
    requiredEvidence: requiredEvidenceRaw.map((item, evidenceIndex) =>
      parseEvidenceType(
        item,
        `acceptanceCriteria[${index}].requiredEvidence[${evidenceIndex}]`,
      ),
    ),
  };
};

const parseExecutionStep = (value: unknown, index: number): ExecutionStep => {
  const raw = asRecord(value, `execution.steps[${index}]`);
  const step: ExecutionStep = {
    id: asNonEmptyString(raw.id, `execution.steps[${index}].id`),
    adapter: asNonEmptyString(raw.adapter, `execution.steps[${index}].adapter`),
    action: asNonEmptyString(raw.action, `execution.steps[${index}].action`),
    criterionId: asNonEmptyString(
      raw.criterionId,
      `execution.steps[${index}].criterionId`,
    ),
    evidenceType: parseEvidenceType(
      raw.evidenceType,
      `execution.steps[${index}].evidenceType`,
    ),
  };

  if (raw.input !== undefined) {
    step.input = asRecord(raw.input, `execution.steps[${index}].input`);
  }
  if (raw.continueOnFailure !== undefined) {
    if (typeof raw.continueOnFailure !== "boolean") {
      throw new Error(
        `execution.steps[${index}].continueOnFailure must be boolean.`,
      );
    }
    step.continueOnFailure = raw.continueOnFailure;
  }
  return step;
};

const parseExecution = (value: unknown): TaskExecutionPlan => {
  const raw = asRecord(value, "execution");
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    throw new Error("execution.steps must contain at least one step.");
  }
  const steps = raw.steps.map(parseExecutionStep);
  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    throw new Error("execution step IDs must be unique within a task.");
  }
  return { steps };
};

export function parseTaskContract(value: unknown): TaskContract {
  const raw = asRecord(value, "task contract");
  const kindRaw = asNonEmptyString(raw.kind, "kind");
  if (!taskKinds.has(kindRaw as TaskKind)) {
    throw new Error(`Unsupported task kind: ${kindRaw}`);
  }

  if (!Array.isArray(raw.acceptanceCriteria) || raw.acceptanceCriteria.length === 0) {
    throw new Error("acceptanceCriteria must contain at least one criterion.");
  }

  if (
    typeof raw.maxAttempts !== "number" ||
    !Number.isInteger(raw.maxAttempts) ||
    raw.maxAttempts < 1 ||
    raw.maxAttempts > 20
  ) {
    throw new Error("maxAttempts must be an integer between 1 and 20.");
  }

  const contract: TaskContract = {
    id: asNonEmptyString(raw.id, "id"),
    title: asNonEmptyString(raw.title, "title"),
    goal: asNonEmptyString(raw.goal, "goal"),
    kind: kindRaw as TaskKind,
    dependencies: asStringArray(raw.dependencies, "dependencies"),
    acceptanceCriteria: raw.acceptanceCriteria.map(parseCriterion),
    maxAttempts: raw.maxAttempts,
  };

  if (raw.execution !== undefined) {
    contract.execution = parseExecution(raw.execution);
  }

  if (new Set(contract.dependencies).size !== contract.dependencies.length) {
    throw new Error("dependencies must not contain duplicates.");
  }

  const criterionIds = new Set(
    contract.acceptanceCriteria.map((criterion) => criterion.id),
  );
  if (criterionIds.size !== contract.acceptanceCriteria.length) {
    throw new Error("acceptance criterion IDs must be unique within a task.");
  }

  if (contract.execution) {
    for (const step of contract.execution.steps) {
      if (!criterionIds.has(step.criterionId)) {
        throw new Error(
          `Execution step ${step.id} references unknown criterion ${step.criterionId}.`,
        );
      }
    }
  }

  return contract;
}

export async function loadTaskContract(filePath: string): Promise<TaskContract> {
  const raw = await readFile(filePath, "utf8");
  return parseTaskContract(JSON.parse(raw) as unknown);
}

export async function loadTaskContracts(
  directory: string,
): Promise<TaskContract[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(files.map((file) => loadTaskContract(join(directory, file))));
}
