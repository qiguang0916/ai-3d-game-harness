#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { evaluateTaskGate } from "./core/gates.js";
import { loadTaskContract, loadTaskContracts } from "./core/contracts.js";
import { assertTaskGraph, readyTasks } from "./core/task-graph.js";
import type { EvidenceRecord, ProjectState } from "./core/types.js";
import {
  doctorConfig,
  discoverConfig,
  runContract,
  runContractAuto,
  runProject,
} from "./runtime.js";
import { writeProjectReport } from "./report.js";
import { preflightProject } from "./preflight.js";

const usage = (): never => {
  console.error(`Usage:
  ai3d-harness init [project-root]
  ai3d-harness validate-contract <contract.json>
  ai3d-harness ready <contracts-dir> <state.json>
  ai3d-harness gate <contract.json> <evidence.json>
  ai3d-harness status <state.json>
  ai3d-harness doctor <harness.config.json>
  ai3d-harness discover <harness.config.json> [adapter-id]
  ai3d-harness run <project-root> <contract.json> <harness.config.json>
  ai3d-harness run-auto <project-root> <contract.json> <harness.config.json>
  ai3d-harness run-project <project-root> <contracts-dir> <harness.config.json>
  ai3d-harness run-project-auto <project-root> <contracts-dir> <harness.config.json>
  ai3d-harness report <project-root> <contracts-dir>
  ai3d-harness preflight <contracts-dir> <harness.config.json>`);
  process.exit(2);
};

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

const commandInit = async (rootArg?: string): Promise<void> => {
  const root = resolve(rootArg ?? process.cwd());
  const projectRoot = join(root, ".project");

  await mkdir(join(projectRoot, "contracts"), { recursive: true });
  await mkdir(join(projectRoot, "evidence"), { recursive: true });
  await mkdir(join(projectRoot, "logs"), { recursive: true });
  await mkdir(join(projectRoot, "screenshots"), { recursive: true });
  await mkdir(join(projectRoot, "renders"), { recursive: true });

  const statePath = join(projectRoot, "state.json");
  try {
    await writeFile(
      statePath,
      `${JSON.stringify({ version: 1, tasks: {} }, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EEXIST"
      )
    ) {
      throw error;
    }
  }

  console.log(`Initialized harness state at ${projectRoot}`);
};

const main = async (): Promise<void> => {
  const [, , command, ...args] = process.argv;
  if (!command) usage();

  switch (command) {
    case "init": {
      await commandInit(args[0]);
      return;
    }
    case "validate-contract": {
      if (args.length !== 1) usage();
      const contract = await loadTaskContract(resolve(args[0]!));
      console.log(`OK ${contract.id} (${contract.kind})`);
      return;
    }
    case "ready": {
      if (args.length !== 2) usage();
      const contracts = await loadTaskContracts(resolve(args[0]!));
      assertTaskGraph(contracts);
      const state = await readJson<ProjectState>(resolve(args[1]!));
      for (const task of readyTasks(contracts, state)) {
        console.log(`${task.id}\t${task.title}`);
      }
      return;
    }
    case "gate": {
      if (args.length !== 2) usage();
      const contract = await loadTaskContract(resolve(args[0]!));
      const evidence = await readJson<EvidenceRecord[]>(resolve(args[1]!));
      const result = evaluateTaskGate(contract, evidence);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.passed ? 0 : 1;
      return;
    }
    case "status": {
      if (args.length !== 1) usage();
      const state = await readJson<ProjectState>(resolve(args[0]!));
      for (const runtime of Object.values(state.tasks)) {
        console.log(
          [
            runtime.taskId,
            runtime.status,
            `attempts=${runtime.attempts}`,
            runtime.lastError ?? "",
          ].join("\t"),
        );
      }
      return;
    }
    case "doctor": {
      if (args.length !== 1) usage();
      const health = await doctorConfig(resolve(args[0]!));
      console.log(JSON.stringify(health, null, 2));
      process.exitCode = health.every((item) => item.ok) ? 0 : 1;
      return;
    }
    case "discover": {
      if (args.length < 1 || args.length > 2) usage();
      const result = await discoverConfig(resolve(args[0]!), args[1]);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.every((item) => item.available) ? 0 : 1;
      return;
    }
    case "run":
    case "run-auto": {
      if (args.length !== 3) usage();
      const options = {
        projectRoot: resolve(args[0]!),
        contractPath: resolve(args[1]!),
        configPath: resolve(args[2]!),
      };
      const result =
        command === "run-auto"
          ? await runContractAuto(options)
          : await runContract(options);
      console.log(
        JSON.stringify(
          {
            summary: result.summary,
            gate: result.gate,
          },
          null,
          2,
        ),
      );
      process.exitCode = result.gate.passed ? 0 : 1;
      return;
    }
    case "run-project":
    case "run-project-auto": {
      if (args.length !== 3) usage();
      const projectRoot = resolve(args[0]!);
      const contractsDir = resolve(args[1]!);
      const result = await runProject({
        projectRoot,
        contractsDir,
        configPath: resolve(args[2]!),
        autoRepair: command === "run-project-auto",
      });
      const report = await writeProjectReport(projectRoot, contractsDir);
      console.log(
        JSON.stringify(
          {
            passed: result.passed,
            taskRuns: result.taskRuns.map((run) => run.summary),
            errors: result.errors,
            report: {
              json: report.jsonPath,
              markdown: report.markdownPath,
            },
          },
          null,
          2,
        ),
      );
      process.exitCode = result.passed ? 0 : 1;
      return;
    }
    case "preflight": {
      if (args.length !== 2) usage();
      const result = await preflightProject(
        resolve(args[0]!),
        resolve(args[1]!),
      );
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    case "report": {
      if (args.length !== 2) usage();
      const result = await writeProjectReport(
        resolve(args[0]!),
        resolve(args[1]!),
      );
      console.log(
        JSON.stringify(
          {
            passed: result.report.passed,
            json: result.jsonPath,
            markdown: result.markdownPath,
          },
          null,
          2,
        ),
      );
      process.exitCode = result.report.passed ? 0 : 1;
      return;
    }
    default:
      usage();
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
});
