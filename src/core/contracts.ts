import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  AcceptanceCriterion,
  EvidenceType,
  TaskContract,
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

const parseCriterion = (value: unknown, index: number): AcceptanceCriterion => {
  const raw = asRecord(value, `acceptanceCriteria[${index}]`);
  const requiredEvidenceRaw = raw.requiredEvidence;
  if (!Array.isArray(requiredEvidenceRaw)) {
    throw new Error(
      `acceptanceCriteria[${index}].requiredEvidence must be an array.`,
    );
  }

  const requiredEvidence = requiredEvidenceRaw.map((item, evidenceIndex) => {
    if (typeof item !== "string" || !evidenceTypes.has(item as EvidenceType)) {
      throw new Error(
        `acceptanceCriteria[${index}].requiredEvidence[${evidenceIndex}] is invalid.`,
      );
    }
    return item as EvidenceType;
  });

  return {
    id: asNonEmptyString(raw.id, `acceptanceCriteria[${index}].id`),
    description: asNonEmptyString(
      raw.description,
      `acceptanceCriteria[${index}].description`,
    ),
    requiredEvidence,
  };
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

  if (new Set(contract.dependencies).size !== contract.dependencies.length) {
    throw new Error("dependencies must not contain duplicates.");
  }
  if (
    new Set(contract.acceptanceCriteria.map((criterion) => criterion.id)).size !==
    contract.acceptanceCriteria.length
  ) {
    throw new Error("acceptance criterion IDs must be unique within a task.");
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
