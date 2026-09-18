import type {
  ExecutionStep,
  ProjectState,
  TaskContract,
  EvidenceOutcome,
} from "../core/types.js";
import type { AdapterHealth } from "./types.js";

export interface ActionExecutionResult {
  outcome: EvidenceOutcome;
  summary: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export interface ActionExecutionContext {
  projectRoot: string;
  task: TaskContract;
  step: ExecutionStep;
  state: ProjectState;
}

export interface ActionAdapter {
  readonly id: string;
  supportsAction(action: string): boolean;
  executeAction(
    action: string,
    input: Record<string, unknown>,
    context: ActionExecutionContext,
  ): Promise<ActionExecutionResult>;
  healthcheck(): Promise<AdapterHealth>;
  discoverTools?(): Promise<unknown[]>;
  close?(): Promise<void>;
}
