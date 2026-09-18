# Roadmap

## v0.1 — Harness foundation

- [x] Repository initialization
- [x] Task contract types
- [x] Dependency graph
- [x] Persistent project state
- [x] Evidence-gated acceptance
- [x] Executor abstraction
- [ ] Evidence persistence
- [ ] CLI
- [ ] CI green
- [ ] Foundation PR

## v0.2 — Blender execution layer

- Blender MCP adapter
- health/capability discovery
- 3D asset contract
- geometry validation report
- deterministic export manifest
- fixed-camera evidence renders

## v0.3 — Unity execution layer

- Unity MCP/runtime adapter
- import and prefab validation
- Console capture
- EditMode/PlayMode test evidence
- Game View screenshot evidence
- profiler/build gates

## v0.4 — First closed loop

Reference asset: `KNIFE_001`.

```text
Task
-> Blender validation/export
-> Unity import/integration
-> PlayMode
-> evidence
-> gate
-> retry/fix
-> DONE
```

## v0.5 — Production orchestration

- resumable multi-step pipelines
- role routing
- fix-task generation
- retry policies
- budgets/timeouts
- artifact provenance
- PR/release gates

## Later

A visual workbench is optional. It should be built only after the headless harness is reliable.
