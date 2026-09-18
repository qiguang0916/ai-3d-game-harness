import { spawn } from "node:child_process";
import type { JsonProcessRepairConfig } from "../config.js";
import type {
  RepairContext,
  RepairProvider,
  RepairResult,
} from "./types.js";

export class JsonProcessRepairProvider implements RepairProvider {
  readonly name = "json-process-repair";

  constructor(private readonly config: JsonProcessRepairConfig) {}

  async repair(context: RepairContext): Promise<RepairResult> {
    const timeoutMs = this.config.timeoutMs ?? 300_000;

    return new Promise<RepairResult>((resolve, reject) => {
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

      const finish = (
        error: Error | undefined,
        result?: RepairResult,
      ): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result ?? { summary: "Repair command completed." });
      };

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout = (stdout + chunk).slice(-65_536);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-65_536);
      });

      child.on("error", (error) => {
        finish(new Error(`Repair process error: ${error.message}`));
      });

      child.on("exit", (code, signal) => {
        if (code === 0) {
          finish(undefined, {
            summary: stdout.trim() || "Repair command completed successfully.",
            metadata: {
              exitCode: code,
              signal,
              stderr: stderr.trim(),
            },
          });
          return;
        }

        finish(
          new Error(
            `Repair command failed (code=${String(code)}, signal=${String(signal)}): ${stderr.trim() || stdout.trim()}`,
          ),
        );
      });

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(
          new Error(`Repair command timed out after ${timeoutMs}ms.`),
        );
      }, timeoutMs);

      child.stdin.end(
        `${JSON.stringify(
          {
            protocol: "ai-3d-game-harness/repair-v1",
            projectRoot: context.projectRoot,
            task: context.task,
            gate: context.gate,
            evidence: context.evidence,
            state: context.state,
          },
          null,
          2,
        )}\n`,
      );
    });
  }
}
