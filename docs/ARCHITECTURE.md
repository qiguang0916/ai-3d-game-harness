# Architecture

## Product boundary

AI 3D Game Harness is the control plane above coding agents and DCC/game-engine tools.

It does **not** replace Codex, Blender, Unity, Blender MCP, or Unity MCP. It coordinates them, records durable state, collects evidence, and decides whether acceptance gates pass.

## Core loop

```text
Task Contract
  -> dependency check
  -> executor selection
  -> execution
  -> evidence collection
  -> gate evaluation
  -> PASS => DONE
  -> FAIL => retry/fix task
```

## Source-of-truth rules

1. Chat history is never project state.
2. Task contracts and runtime state live on disk.
3. An agent saying "done" is not evidence.
4. A task is complete only when every required acceptance criterion has passing evidence.
5. Blender remains the geometry source of truth for authored 3D assets.
6. Unity remains the runtime source of truth for in-game integration.

## Planned modules

- `core/task-graph`: dependency and readiness logic.
- `core/gates`: acceptance criteria and evidence evaluation.
- `core/orchestrator`: task execution state machine.
- `core/state-store`: durable project state.
- `adapters/*`: Codex, Blender MCP, Unity MCP, and future executors.
- `evidence/*`: logs, screenshots, tests, profiler captures, asset reports.
- `pipelines/*`: 3D asset, Unity integration, gameplay, QA, build.
- `cli`: local operator interface.

## Initial reference pipeline

```text
KNIFE_001 task
  -> Blender validation/export
  -> Unity import
  -> material/prefab/collider integration
  -> PlayMode
  -> console/tests/screenshot
  -> evidence gate
```
