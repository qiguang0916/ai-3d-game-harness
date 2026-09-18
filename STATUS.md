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
- MCP initialize / tool discovery / tool calls
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

Therefore **real Blender -> Unity E2E is the remaining integration gate**, not a completed CI claim.

Use [docs/LOCAL_E2E.md](docs/LOCAL_E2E.md) for that run.

## Release decision

Do not call the project production-ready or tag a stable v1.0 until the real-machine KNIFE_001 pipeline passes with stored evidence.
