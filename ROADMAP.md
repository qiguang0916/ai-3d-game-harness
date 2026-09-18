# Roadmap

## Headless v0.1 — control plane MVP

Completed:

- [x] Task Contract model and validation
- [x] Dependency DAG validation and execution
- [x] Persistent project state
- [x] Attempt-versioned evidence history
- [x] Evidence-gated acceptance
- [x] Generic MCP stdio client
- [x] Live MCP tool/schema discovery
- [x] MCP bootstrap calls for dynamic tool groups
- [x] Stable-action to server-argument templates
- [x] Cross-task evidence/artifact handoff
- [x] Semantic MCP result checks
- [x] Generic JSON-process agent adapter
- [x] Optional automatic repair provider
- [x] Automatic retry / revalidation loop
- [x] Downstream blocking after failed dependencies
- [x] Project write locking
- [x] Doctor and preflight diagnostics
- [x] JSON + Markdown project reports
- [x] CLI for single-task and project-DAG execution
- [x] KNIFE_001 three-stage reference DAG
- [x] CI integration tests for the full control plane

## Real-machine integration gate

The software control plane is implemented and CI-tested. The next gate is environment-specific:

- [ ] Connect a real Blender MCP installation
- [ ] Run Blender health/tool discovery
- [ ] Bind KNIFE_001 Blender actions to concrete MCP tools
- [ ] Connect a real Unity MCP installation
- [ ] Run Unity health/tool discovery
- [ ] Bind Unity import / prefab / PlayMode / Console / screenshot / test / profiler actions
- [ ] Execute the KNIFE_001 DAG on the target Mac
- [ ] Inspect real evidence and close any adapter-specific gaps

This gate cannot be proven by hosted CI because Blender, Unity, the selected MCP servers, and the game project live on the target development machine.

## After real E2E

Only add capabilities justified by real project use:

- role/model routing
- task budgets and cancellation policies
- artifact provenance hashes
- richer performance budgets
- Git/PR delivery gates
- reusable Unity/Blender presets based on verified server versions
- parallel execution for independent read-safe tasks
- optional visual workbench

## Product principle

Do not build a large GUI before the headless execution and evidence loop is reliable on a real 3D game project.
