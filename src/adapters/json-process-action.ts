import { spawn } from "node:child_process";
import type { JsonProcessActionAdapterConfig } from "../config.js";
import type {
  ActionAdapter,
  ActionExecutionContext,
  ActionExecutionResult,
} from "./action.js";
import type { AdapterHealth } from "./types.js";

const parseResult = (
  stdout: string,
  stderr: string,
): ActionExecutionResult => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error(
      `JSON process adapter returned no result. stderr=${stderr.trim()}`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(lines[lines.length - 1]!);
  } catch (error) {
    throw new Error(
      `JSON process adapter must emit its result as the final JSON line: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("JSON process result must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const outcome = record.outcome;
  const summary = record.summary;

  if (outcome !== "pass" && outcome !== "fail" && outcome !== "info") {
    throw new Error('JSON process result.outcome must be "pass", "fail", or "info".');
  }
  if (typeof summary !== "string" || summary.trim() === "") {
    throw new Error("JSON process result.summary must be a non-empty string.");
  }

  const result: ActionExecutionResult = {
    outcome,
    summary,
    metadata: {
      stderr: stderr.trim(),
      ...(typeof record.metadata === "object" &&
      record.metadata !== null &&
      !Array.isArray(record.metadata)
        ? (record.metadata as Record<string, unknown>)
        : {}),
    },
  };
  if (typeof record.uri === "string" && record.uri !== "") {
    result.uri = record.uri;
  }
  return result;
};

export class JsonProcessActionAdapter implements ActionAdapter {
  constructor(
    readonly id: string,
    private readonly config: JsonProcessActionAdapterConfig,
  ) {}

  supportsAction(action: string): boolean {
    return this.config.actions.includes(action);
  }

  async healthcheck(): Promise<AdapterHealth> {
    return {
      ok: true,
      adapter: this.id,
      details: {
        transport: "json-process",
        command: this.config.command,
        actions: this.config.actions,
      },
    };
  }

  async executeAction(
    action: string,
    input: Record<string, unknown>,
    context: ActionExecutionContext,
  ): Promise<ActionExecutionResult> {
    if (!this.supportsAction(action)) {
      throw new Error(`Adapter ${this.id} does not allow action ${action}.`);
    }

    const timeoutMs = this.config.timeoutMs ?? 300_000;
    return new Promise<ActionExecutionResult>((resolve, reject) => {
      const child = spawn(this.config.command, this.config.args ?? [], {
        cwd: this.config.cwd ?? context.projectRoot,
        env: {
          ...process.env,
          ...(this.config.env ?? {}),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const finish = (
        error: Error | undefined,
        result?: ActionExecutionResult,
      ): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (error) reject(error);
        else resolve(result ?? { outcome: "info", summary: "Process completed." });
      };

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout = (stdout + chunk).slice(-262_144);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-65_536);
      });
      child.on("error", (error) => {
        finish(new Error(`Action process error: ${error.message}`));
      });
      child.on("exit", (code, signal) => {
        if (code !== 0) {
          finish(
            new Error(
              `Action process failed (code=${String(code)}, signal=${String(signal)}): ${stderr.trim() || stdout.trim()}`,
            ),
          );
          return;
        }
        try {
          finish(undefined, parseResult(stdout, stderr));
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });

      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(
          new Error(`Action process timed out after ${timeoutMs}ms.`),
        );
      }, timeoutMs);

      child.stdin.end(
        `${JSON.stringify(
          {
            protocol: "ai-3d-game-harness/action-v1",
            adapter: this.id,
            action,
            input,
            projectRoot: context.projectRoot,
            task: context.task,
            step: context.step,
            state: context.state,
          },
          null,
          2,
        )}\n`,
      );
    });
  }
}
