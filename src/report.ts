import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadTaskContracts } from "./core/contracts.js";
import { evaluateTaskGate } from "./core/gates.js";
import { JsonStateStore } from "./core/state-store.js";
import { JsonEvidenceStore } from "./evidence/store.js";

export interface ProjectReportTask {
  id: string;
  title: string;
  status: string;
  attempts: number;
  gatePassed: boolean;
  evidenceCount: number;
  lastError?: string;
}

export interface ProjectReport {
  generatedAt: string;
  passed: boolean;
  counts: Record<string, number>;
  tasks: ProjectReportTask[];
}

export async function buildProjectReport(
  projectRootArg: string,
  contractsDirArg: string,
): Promise<ProjectReport> {
  const projectRoot = resolve(projectRootArg);
  const contracts = await loadTaskContracts(resolve(contractsDirArg));
  const state = await new JsonStateStore(
    join(projectRoot, ".project", "state.json"),
  ).load();
  const evidenceStore = new JsonEvidenceStore(
    join(projectRoot, ".project", "evidence"),
  );

  const tasks: ProjectReportTask[] = [];
  const counts: Record<string, number> = {};

  for (const contract of contracts) {
    const runtime = state.tasks[contract.id];
    const evidence = await evidenceStore.loadTask(contract.id);
    const gate = evaluateTaskGate(contract, evidence);
    const status = runtime?.status ?? "missing";
    counts[status] = (counts[status] ?? 0) + 1;

    const task: ProjectReportTask = {
      id: contract.id,
      title: contract.title,
      status,
      attempts: runtime?.attempts ?? 0,
      gatePassed: gate.passed,
      evidenceCount: evidence.length,
    };
    if (runtime?.lastError) task.lastError = runtime.lastError;
    tasks.push(task);
  }

  return {
    generatedAt: new Date().toISOString(),
    passed: tasks.length > 0 && tasks.every((task) => task.status === "done"),
    counts,
    tasks,
  };
}

const markdown = (report: ProjectReport): string => {
  const lines = [
    "# AI 3D Game Harness Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Overall: **${report.passed ? "PASS" : "NOT READY"}**`,
    "",
    "| Task | Status | Attempts | Gate | Evidence | Last error |",
    "| --- | --- | ---: | --- | ---: | --- |",
  ];

  for (const task of report.tasks) {
    lines.push(
      `| ${task.id} — ${task.title.replaceAll("|", "\\|")} | ${task.status} | ${task.attempts} | ${task.gatePassed ? "PASS" : "FAIL"} | ${task.evidenceCount} | ${(task.lastError ?? "").replaceAll("|", "\\|")} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
};

export async function writeProjectReport(
  projectRootArg: string,
  contractsDirArg: string,
) {
  const projectRoot = resolve(projectRootArg);
  const report = await buildProjectReport(projectRoot, contractsDirArg);
  const directory = join(projectRoot, ".project", "reports");
  await mkdir(directory, { recursive: true });

  const jsonPath = join(directory, "latest.json");
  const markdownPath = join(directory, "latest.md");
  await writeFile(
    jsonPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(markdownPath, markdown(report), "utf8");

  return { report, jsonPath, markdownPath };
}
