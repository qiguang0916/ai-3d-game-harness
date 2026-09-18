# AI 3D Game Harness

AI-first orchestration and verification for one-person 3D game development with Codex, Blender, and Unity.

## Mission

Turn a high-level game-development task into a verifiable closed loop:

```text
Task Contract
  -> Agent execution
  -> Blender / Unity adapters
  -> Evidence collection
  -> Quality gates
  -> PASS / FAIL
  -> retry or DONE
```

The project is intentionally built as its own product rather than as a fork of a single upstream repository.

## First reference pipeline

The first end-to-end reference pipeline will validate one 3D asset through the complete path:

```text
Blender asset
  -> geometry/export checks
  -> Unity import
  -> material/prefab/collider integration
  -> PlayMode
  -> console/tests/screenshot evidence
  -> QA gate
```

## Status

Foundation development has started.
