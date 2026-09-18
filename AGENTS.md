# AI 3D Game Harness operating contract

## Mission

Build a reliable AI-first control plane for 3D game development. The harness coordinates agents and tools; it does not replace Blender or Unity.

## Non-negotiable rules

- Project state comes from repository files, never chat memory.
- "Agent says done" is never sufficient evidence.
- A task reaches `done` only when all acceptance criteria pass.
- Prefer adapters around mature external tools over reimplementing them.
- Keep Blender as the geometry source of truth and Unity as the runtime source of truth.
- Keep engine-specific implementation behind adapters.
- Do not silently weaken quality gates to make a task pass.
- External writes, publishing, destructive operations, and paid actions require explicit authorization.

## Development discipline

- Work through small reviewable branches.
- Add tests for orchestration, state, graph, and gate logic.
- Keep the core deterministic and testable without Blender or Unity installed.
- Treat screenshots, logs, test results, profiler captures, and asset reports as first-class evidence.
- Keep third-party reuse license-compatible and documented in `docs/UPSTREAMS.md`.

## Current milestone

Foundation v0.1:
1. task contracts
2. persistent state
3. dependency graph
4. evidence store
5. gate evaluator
6. executor abstraction
7. CLI
8. CI

Next: Blender adapter, Unity adapter, then the KNIFE_001 closed-loop reference pipeline.
