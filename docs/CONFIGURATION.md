# Configuration

The harness keeps its own stable task/action vocabulary while allowing different agent, Blender, and Unity integrations.

## Adapter types

### `mcp-stdio`

Use for MCP servers.

```json
{
  "type": "mcp-stdio",
  "command": "your-unity-mcp-command",
  "args": [],
  "actions": {
    "tests": { "tool": "run_tests" },
    "console": { "tool": "get_console" }
  }
}
```

Run `doctor` to perform the MCP handshake, list tools, and confirm every configured mapping exists:

```bash
node dist/cli.js doctor harness.config.json
```

#### Semantic outcome checks

A tool invocation can succeed while the QA result fails. An action mapping may therefore add:

```json
{
  "tool": "validate_prefab",
  "successPath": "structuredContent.success",
  "failureTextIncludes": ["validation failed"]
}
```

Evaluation order:

1. MCP `isError: true` => FAIL.
2. configured failure text found => FAIL.
3. configured `successPath` is not exactly `true` => FAIL.
4. otherwise => PASS.

### `json-process`

Use for coding agents, supervisors, or deterministic scripts.

```json
{
  "type": "json-process",
  "command": "/path/to/codex-wrapper",
  "actions": ["implement", "review"]
}
```

See [AGENT_ADAPTERS.md](AGENT_ADAPTERS.md) for its stdin/stdout protocol.

## Repair provider

Optional automatic repair is independent of action adapters:

```json
{
  "repair": {
    "type": "json-process",
    "command": "/path/to/repair-wrapper",
    "timeoutMs": 300000
  }
}
```

See [REPAIR_LOOP.md](REPAIR_LOOP.md).

## Task execution plan

A contract references adapter + action rather than an implementation-specific MCP tool:

```json
{
  "execution": {
    "steps": [
      {
        "id": "tests",
        "adapter": "unity",
        "action": "tests",
        "criterionId": "A05",
        "evidenceType": "test",
        "input": {}
      }
    ]
  }
}
```

Each step creates a first-class evidence record. A task becomes DONE only when the latest attempt satisfies every required evidence type for every acceptance criterion.

## Preflight

Before a real run:

```bash
node dist/cli.js preflight <contracts-dir> harness.config.json
```

Preflight checks:

- task dependency DAG validity
- missing execution plans
- missing adapters
- unsupported actions
- MCP adapter health and concrete tool mappings

## Security

MCP servers and JSON process adapters can control powerful local applications and modify files.

- Treat configured commands as trusted executables.
- Keep credentials in environment variables.
- Do not commit secrets.
- Use project write locking; do not bypass `.project/harness.lock` while another run is active.
- Keep paid/external/destructive actions behind the wrapper's own authorization policy.
