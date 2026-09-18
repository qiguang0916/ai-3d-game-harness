#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { evaluateTaskGate } from "./core/gates.js";
import { loadTaskContract, loadTaskContracts } from "./core/contracts.js";
import { assertTaskGraph, readyTasks } from "./core/task-graph.js";
import { initialProjectState } from "./core/state-store.js";
import type { EvidenceRecord, ProjectState } from "./core/types.js";

const usage = (): never => {
  console.error(`Usage:
  ai3d-harness init [project-root]
  ai3d-harness validate-contract <contract.json>
  ai3d-harness ready <contracts-dir> <state.json>
  ai3d-harness gate <contract.json> <evidence.json>
  ai3d-harness status <state.json>`);
  process.exit(2);
};

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

const commandInit = async (rootArg?: string): Promise<void> => {
  const root = resolve(rootArg ?? process.cwd());
  const projectRoot = join(root, ".project");
  const contractsDir = join(projectRoot, "contracts");
  const evidenceDir = join(projectRoot, "evidence");

  await mkdir(contractsDir, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
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
    default:
      usage();
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
});
