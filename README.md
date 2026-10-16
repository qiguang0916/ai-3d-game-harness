# AI 3D Game Harness

A headless control plane for one-person, AI-assisted 3D game development.

It coordinates coding agents, Blender, Unity, MCP tools, evidence collection, quality gates, repair loops, and durable project state.

## Core idea

```text
Task DAG
  -> Agent / tool execution
  -> Blender / Unity
  -> Evidence
  -> Quality Gate
  -> PASS => DONE
  -> FAIL => Repair => Re-run
```

An agent saying "done" is not completion. Evidence is.

## What the harness owns

- task contracts and dependency DAGs
- persistent project state outside chat history
- action routing
- generic MCP stdio transport
- generic JSON-process agent adapters
- Blender / Unity action mapping
- evidence history by attempt
- semantic quality gates
- automatic repair hooks
- dependency blocking after failures
- project write locking
- preflight / doctor checks
- machine-readable and Markdown reports

## What it does not replace

- Codex or another coding agent
- Blender
- Unity
- Blender MCP
- Unity MCP

Those systems do the work. The harness decides what runs, records what happened, and determines whether the result is accepted.

## Architecture

```text
                        Task Contracts
                              |
                         Dependency DAG
                              |
                         Harness Runtime
                    /---------+----------\
                   /                     \
          JSON Process Adapter         MCP Adapter
          Codex / Supervisor        Blender / Unity
                   \                     /
                    \---------+----------/
                              |
                           Evidence
                              |
                         Quality Gate
                         /          \
                      FAIL          PASS
                       |              |
                    Repair           DONE
                       |
                     Re-run
```

## Quick start

Requires Node.js 20+.

```bash
npm install
npm test
npm run build
```

Initialize durable runtime state:

```bash
node dist/cli.js init /path/to/game-project
```

Check adapter/tool bindings before execution:

```bash
node dist/cli.js doctor harness.config.json
node dist/cli.js preflight examples/knife-001/contracts harness.config.json
```

Run one task:

```bash
node dist/cli.js run \
  /path/to/game-project \
  examples/knife-001/contracts/01-blender.json \
  harness.config.json
```

Run the complete task DAG:

```bash
node dist/cli.js run-project \
  /path/to/game-project \
  examples/knife-001/contracts \
  harness.config.json
```

With a repair provider such as a Codex/Supervisor wrapper:

```bash
node dist/cli.js run-project-auto \
  /path/to/game-project \
  examples/knife-001/contracts \
  harness.config.json
```

## KNIFE_001 reference pipeline

The repository includes a real three-stage 3D asset DAG:

```text
T-KNIFE-001-BLENDER
  inspect -> export -> validation render
            |
            v
T-KNIFE-001-UNITY
  import -> prefab integration
            |
            v
T-KNIFE-001-QA
  PlayMode -> Console -> screenshot -> tests -> profile
```

See `examples/knife-001/contracts/`.

## Evidence

Evidence is versioned by attempt. A failed attempt remains in history for audit, but a repaired later attempt can pass the gate.

Supported evidence classes:

- file
- log
- screenshot
- test
- profiler
- asset-report
- runtime-observation

Runtime state is stored under:

```text
.project/
  state.json
  evidence/
  reports/
  harness.lock
```

## Adapter types

### MCP stdio

Maps stable harness actions to whatever tool names the selected MCP server exposes.

```json
{
  "type": "mcp-stdio",
  "command": "your-mcp-server",
  "actions": {
    "tests": {
      "tool": "run_tests",
      "successPath": "structuredContent.success"
    }
  }
}
```

### JSON process

Turns Codex, a supervisor, another agent, or a deterministic local script into a first-class task executor.

```json
{
  "type": "json-process",
  "command": "/path/to/codex-wrapper",
  "actions": ["implement", "review"]
}
```

See [docs/AGENT_ADAPTERS.md](docs/AGENT_ADAPTERS.md).

## Repair loop

A separate repair provider receives the failed task, gate, evidence history, and state. If repair succeeds, the harness runs a new attempt and re-evaluates only the latest attempt.

See [docs/REPAIR_LOOP.md](docs/REPAIR_LOOP.md).

## Real Blender + Unity validation

CI can fully test the Harness control plane using local fake MCP/process servers. CI cannot prove a user's Blender/Unity installation.

The final real-machine E2E is documented in [docs/LOCAL_E2E.md](docs/LOCAL_E2E.md).

## Design influences

The project is its own implementation, not a fork. It selectively learns from MIT-licensed projects including:

- `ilezhnin/gamedev-ai-agents`
- `tykisgod/quick-question`
- `MRCalderon3D/everything-game-dev-code`

See [docs/UPSTREAMS.md](docs/UPSTREAMS.md).

## License

MIT.


## v0.2-alpha branch: evidence-first Unity QA

The `feat/v0.2-unity-test-harness` branch adds **read-only artifact QA** to the existing DAG + MCP control plane. It does not claim an actual Unity Editor E2E connection until a target-project identity check passes.

New `qa-file` adapter:
- `unity-xml`: inspect **completed** NUnit XML, exact test counts, failed/skipped/inconclusive = 0;
- `png`: check real PNG structure, dimensions, per-chunk CRC and decompression;
- `json-pass` / `json-check`: verify HUD pixel reports and QA19/QA22 physics JSON assertions;
- `log-markers`: require explicit runtime events, reject forbidden markers;
- `project-identity`: verify specific Git branch, Unity Editor version, optional clean worktree and **exact active Editor path**;
- snapshot all evidence by SHA-256 into the isolated Harness runtime project.

Use `requireVerifiedEvidence: true` on acceptance criteria to prevent a successful MCP invocation from satisfying test/screenshot acceptance without a verified, hashed local evidence file.

See [upgrade plan](docs/UPGRADE_V02_IMPLEMENTATION.md), [work breakdown](docs/UPGRADE_V02_TASKS.md), [runbook](docs/V02_LOCAL_RUNBOOK.md) and [execution report](docs/V02_IMPLEMENTATION_REPORT_20261016.md). A generic strict contract is under `examples/second-life-workshop/`.

**Boundary:** MCP protocol discovery, historical-artefact verification and deterministic replay are distinct levels. Actual Unity Editor TestJob lifecycle, new Player replay, OS mouse automation and full-game E2E remain future gated phases. Do not treat this alpha branch as a commercial Unity test certification.
