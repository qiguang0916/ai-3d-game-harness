# Repair loop

The harness can re-run failed quality gates after an external repair process changes the project.

## Why repair is external

The control plane should not hard-code one model vendor or one CLI. Instead it emits a structured repair request and lets a configured process perform the change.

That process can be:

- Codex CLI through a wrapper
- a ChatGPT/Codex supervisor
- Claude Code
- a studio-specific agent
- a deterministic repair script

## Protocol

The repair process receives JSON on stdin:

```json
{
  "protocol": "ai-3d-game-harness/repair-v1",
  "projectRoot": "...",
  "task": {},
  "gate": {},
  "evidence": [],
  "state": {}
}
```

Exit code 0 means the repair process finished and the harness should re-run the task. A non-zero exit code aborts the repair cycle.

Old failed evidence stays on disk for audit history, but quality gates evaluate the latest attempt only.

## Configuration

```json
{
  "repair": {
    "type": "json-process",
    "command": "/path/to/repair-wrapper",
    "args": [],
    "timeoutMs": 300000
  }
}
```

Use `run-auto` or `run-project-auto` to enable repair.
