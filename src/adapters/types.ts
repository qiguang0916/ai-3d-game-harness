import type { TaskContract, TaskExecutor } from "../core/types.js";

export interface AdapterHealth {
  ok: boolean;
  adapter: string;
  details: Record<string, unknown>;
}

export interface HarnessAdapter extends TaskExecutor {
  healthcheck(): Promise<AdapterHealth>;
  describeCapabilities(): Promise<{
    taskKinds: TaskContract["kind"][];
    capabilities: string[];
  }>;
}
