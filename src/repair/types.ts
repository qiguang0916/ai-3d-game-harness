import type {
  EvidenceRecord,
  ProjectState,
  TaskContract,
  TaskGateResult,
} from "../core/types.js";

export interface RepairContext {
  projectRoot: string;
  task: TaskContract;
  gate: TaskGateResult;
  evidence: EvidenceRecord[];
  state: ProjectState;
}

export interface RepairResult {
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface RepairProvider {
  readonly name: string;
  repair(context: RepairContext): Promise<RepairResult>;
}
