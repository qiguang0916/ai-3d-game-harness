export type TaskKind =
  | "blender"
  | "unity"
  | "integration"
  | "gameplay"
  | "qa"
  | "build"
  | "generic";

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "failed"
  | "done";

export type EvidenceType =
  | "file"
  | "log"
  | "screenshot"
  | "test"
  | "profiler"
  | "asset-report"
  | "runtime-observation";

export type EvidenceOutcome = "pass" | "fail" | "info";

export interface AcceptanceCriterion {
  id: string;
  description: string;
  requiredEvidence: EvidenceType[];
}

export interface ExecutionStep {
  id: string;
  adapter: string;
  action: string;
  criterionId: string;
  evidenceType: EvidenceType;
  input?: Record<string, unknown>;
  continueOnFailure?: boolean;
}

export interface TaskExecutionPlan {
  steps: ExecutionStep[];
}

export interface TaskContract {
  id: string;
  title: string;
  goal: string;
  kind: TaskKind;
  dependencies: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  maxAttempts: number;
  execution?: TaskExecutionPlan;
}

export interface EvidenceRecord {
  id: string;
  taskId: string;
  criterionId: string;
  type: EvidenceType;
  outcome: EvidenceOutcome;
  summary: string;
  capturedAt: string;
  attempt?: number;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskRuntimeState {
  taskId: string;
  status: TaskStatus;
  attempts: number;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastError?: string;
  evidenceIds: string[];
}

export interface ProjectState {
  version: 1;
  tasks: Record<string, TaskRuntimeState>;
}

export interface ExecutorResult {
  evidence: EvidenceRecord[];
  notes?: string;
}

export interface TaskExecutor {
  readonly name: string;
  supports(task: TaskContract): boolean;
  execute(task: TaskContract, state: ProjectState): Promise<ExecutorResult>;
}

export interface CriterionGateResult {
  criterionId: string;
  passed: boolean;
  missingEvidence: EvidenceType[];
  failingEvidenceIds: string[];
  passingEvidenceIds: string[];
}

export interface TaskGateResult {
  taskId: string;
  passed: boolean;
  criteria: CriterionGateResult[];
}
