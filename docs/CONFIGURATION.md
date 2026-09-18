# Configuration

The harness uses a small stable action vocabulary while allowing each MCP server to expose its own tool names.

## Why tool mapping exists

Blender and Unity MCP implementations do not all use identical tool names. The harness therefore maps:

```text
Harness action -> MCP tool
```

A task contract references the stable action. The project config selects the concrete MCP tool.

## Example

```json
{
  "version": 1,
  "adapters": {
    "unity": {
      "type": "mcp-stdio",
      "command": "your-unity-mcp-command",
      "args": [],
      "actions": {
        "tests": { "tool": "run_tests" },
        "console": { "tool": "get_console" }
      }
    }
  }
}
```

Run:

```bash
ai3d-harness doctor harness.config.json
```

The doctor starts each configured MCP server, performs the MCP initialize handshake, lists tools, and reports any configured mappings whose tool is not exposed by that server.

## Task execution

A contract may contain an execution plan:

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

Each step produces a first-class evidence record. MCP tool results with `isError: true` produce failing evidence. A task is DONE only when the quality gate has every evidence type required by every acceptance criterion.

## Security

MCP servers can control powerful local applications. Treat configured commands as trusted local executables. Keep credentials in environment variables, not committed JSON.
