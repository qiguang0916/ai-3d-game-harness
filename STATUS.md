# Project Status

## Current status

**Headless control plane: CI-validated MVP**

The repository now contains an executable task/DAG harness rather than only prompts or documentation.

## Verified in GitHub Actions

Automated tests cover:

- contract parsing and validation
- dependency-cycle rejection
- readiness ordering
- state persistence
- evidence persistence
- latest-attempt quality gates
- MCP initialize / live tool-schema discovery / tool calls
- MCP bootstrap calls for optional tool groups
- server-specific argument-template mapping
- cross-task artifact/evidence handoff
- semantic MCP pass/fail mapping
- JSON-process agent execution
- automatic repair and retry
- project DAG completion
- downstream blocking after failure
- executor process-error recovery
- project locking
- preflight diagnostics
- project reports
- KNIFE_001 example DAG structure

## Not yet truthfully verified

A hosted runner does not have the target Mac's:

- Blender installation
- Unity installation/project
- chosen Blender MCP server
- chosen Unity MCP server
- KNIFE_001 source asset

Therefore **real Blender -> Unity E2E is the remaining environment-specific integration gate**, not a completed CI claim. The repository also includes an upstream Unity MCP protocol smoke workflow so the Harness can be checked against a real pinned Coplay server without claiming that Unity Editor itself was exercised.

Use [docs/LOCAL_E2E.md](docs/LOCAL_E2E.md) for that run.

## Release decision

Do not call the project production-ready or tag a stable v1.0 until the real-machine KNIFE_001 pipeline passes with stored evidence.


## v0.2-alpha isolated rollout (2026-10-15/16)

**Phase 0–1: implemented; Phase 2 protocol handshake only; full Unity Editor/Player E2E: BLOCKED/NOT RUN.**

- Added strict NUnit XML, PNG and QA JSON artifact verification; SHA-256 snapshots; verified-evidence task-gate option; project Git/Unity/Editor identity check.
- Validated the control plane with a private historical Second Life Workshop DAG (8/8 tasks PASS), plus two intended blocked-negative test paths.
- Coplay Unity MCP v10.2.0 stdio initialize/listTools/Doctor passed and exposed 47 tools. The target HUD Editor was not running; no target Editor connection or live Unity test call has been claimed.
- Local machine paths/configs/test logs live in `.local-pilot/`, excluded from Git. The user’s separate Unity game worktree was not modified.
- Detailed evidence and limitations in `docs/V02_IMPLEMENTATION_REPORT_20261016.md`.

A new version tag or stable v1.0 is **not** warranted until real target-machine E2E and release gates pass.
