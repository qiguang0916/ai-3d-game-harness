# AI 3D Game Harness

AI-first orchestration and verification for one-person 3D game development with Codex, Blender, and Unity.

## Why this exists

Coding agents can write code, but game development is only complete when the asset imports, the scene runs, the mechanic is reachable, the Console is clean, tests pass, and visual/runtime evidence proves the result.

This harness adds the missing control plane:

```text
Task Contract
  -> dependency check
  -> agent/tool execution
  -> Blender / Unity
  -> evidence collection
  -> quality gates
  -> PASS / FAIL
  -> retry or DONE
```

An agent saying "done" is not a completion signal. Evidence is.

## Product boundary

The harness does not replace:

- Codex or another coding agent
- Blender
- Unity
- Blender MCP
- Unity MCP

It coordinates them and keeps durable project state outside chat history.

## Foundation v0.1

Implemented on the foundation branch:

- typed task contracts
- dependency graph validation
- persistent project-state primitives
- evidence records and JSON evidence persistence
- evidence-based gate evaluation
- executor/adapter abstraction
- orchestration state machine
- CLI foundation
- unit tests
- GitHub Actions CI

## CLI

After `npm install`:

```bash
npm run build

node dist/cli.js init .
node dist/cli.js validate-contract examples/knife-001/task-contract.json
node dist/cli.js status .project/state.json
```

## First reference pipeline

The first real end-to-end target is `KNIFE_001`:

```text
Blender asset
  -> geometry/export validation
  -> Unity import
  -> material/prefab/collider integration
  -> PlayMode
  -> Console/tests/screenshot
  -> evidence gate
  -> retry/fix or DONE
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/UPSTREAMS.md](docs/UPSTREAMS.md), and [ROADMAP.md](ROADMAP.md).

## Upstream strategy

The project is its own codebase rather than a fork. It selectively learns from MIT-licensed projects such as `gamedev-ai-agents`, `quick-question`, and `everything-game-dev-code`, while keeping a unified architecture focused on Blender + Unity + Codex.
