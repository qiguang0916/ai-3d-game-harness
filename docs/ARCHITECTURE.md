# Architecture

## Product boundary

AI 3D Game Harness is the control plane above coding agents, DCC tools, and game-engine tools.

It does **not** replace Codex, Blender, Unity, Blender MCP, or Unity MCP. It coordinates them, persists state, collects evidence, applies acceptance policy, and controls retry/repair.

## Core loop

```text
Task DAG
  -> readiness / dependency check
  -> action adapter selection
  -> agent or MCP execution
  -> evidence persistence
  -> latest-attempt quality gate
  -> PASS => DONE
  -> FAIL => optional repair => next attempt
  -> terminal failure => block dependents
```

## Source-of-truth rules

1. Chat history is never project state.
2. Task contracts and runtime state live on disk.
3. An agent saying "done" is not evidence.
4. Tool invocation success is not automatically QA success.
5. A task is complete only when every required acceptance criterion has passing evidence from the latest attempt.
6. Failed evidence is retained for audit history.
7. Blender remains the geometry source of truth for authored 3D assets.
8. Unity remains the runtime source of truth for in-game integration.

## Layers

### Contract layer

Task contracts define:

- goal
- dependencies
- acceptance criteria
- required evidence types
- maximum attempts
- ordered execution steps

### Orchestration layer

The project runner:

- validates the DAG
- discovers ready tasks
- runs independent branches without violating dependencies
- persists state atomically
- blocks downstream work after terminal dependency failure
- protects mutating runs with a project lock

### Adapter layer

Two first-class adapter types exist.

`mcp-stdio`:
- launches an MCP server
- performs initialize handshake
- discovers tools
- maps stable harness actions to concrete tool names
- calls tools
- translates results into evidence
- supports semantic pass/fail checks

`json-process`:
- launches a coding agent, supervisor, or deterministic script
- sends a stable JSON action protocol over stdin
- receives a structured outcome over stdout

### Evidence / gate layer

Evidence is keyed by task, criterion, type, and attempt.

Quality gates evaluate only the latest attempt, which allows a repaired attempt to supersede an older failure without deleting audit history.

### Repair layer

A repair provider receives:

- task contract
- failed gate
- evidence
- project state
- project root

If it exits successfully, the harness starts a new attempt and validates again.

### Reporting layer

The harness emits durable project reports under `.project/reports/` so completion can be audited without relying on terminal output.

## KNIFE_001 reference DAG

```text
T-KNIFE-001-BLENDER
  inspect -> export -> fixed-view evidence
            |
            v
T-KNIFE-001-UNITY
  import -> prefab/integration inspection
            |
            v
T-KNIFE-001-QA
  PlayMode -> Console -> screenshot -> scene observation -> tests -> profiler
```

Concrete MCP tool names are intentionally configuration-driven because different Blender/Unity MCP servers expose different tool surfaces.

## Test boundary

Hosted CI validates the complete harness control plane using fake MCP and process executors. Real Blender/Unity correctness requires a target-machine E2E run with the actual installed applications, selected MCP servers, and game project.
