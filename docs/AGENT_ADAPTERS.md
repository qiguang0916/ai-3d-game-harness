# Agent and process adapters

The harness can use a local process as a first-class execution adapter. This is the bridge for Codex, a supervisor, Claude Code, or studio-specific automation.

## Contract

The process receives JSON on stdin:

```json
{
  "protocol": "ai-3d-game-harness/action-v1",
  "adapter": "codex",
  "action": "implement",
  "input": {},
  "projectRoot": "/path/to/game",
  "task": {},
  "step": {},
  "state": {}
}
```

It must exit with code 0 and emit its result as the final non-empty stdout line:

```json
{
  "outcome": "pass",
  "summary": "Implemented and validated the requested change.",
  "metadata": {}
}
```

Allowed outcomes are `pass`, `fail`, and `info`.

## Example configuration

```json
{
  "version": 1,
  "adapters": {
    "codex": {
      "type": "json-process",
      "command": "/path/to/codex-wrapper",
      "actions": ["implement", "review"]
    }
  }
}
```

The wrapper owns vendor-specific invocation. The harness owns task state, evidence, ordering, acceptance, and retries.

This separation lets the project change AI providers without changing the game-development state machine.
