# Local Blender + Unity E2E

CI verifies the harness protocol using a fake MCP server. Real Blender and Unity validation requires a machine where those applications and their selected MCP servers are installed.

## 1. Configure MCP servers

Copy:

```text
examples/harness.config.example.json
```

to a local, uncommitted `harness.config.json`.

Replace each MCP command and tool mapping with the server installed on the machine.

## 2. Verify capabilities

```bash
npm run build
node dist/cli.js doctor harness.config.json
```

Do not proceed until the doctor reports every adapter mapping as available.

## 3. Initialize state

```bash
node dist/cli.js init /path/to/game-project
```

## 4. Run the KNIFE_001 project DAG

```bash
node dist/cli.js run-project \
  /path/to/game-project \
  examples/knife-001/contracts \
  harness.config.json
```

With a repair provider configured:

```bash
node dist/cli.js run-project-auto \
  /path/to/game-project \
  examples/knife-001/contracts \
  harness.config.json
```

## 5. Inspect evidence

The run writes durable state under:

```text
.project/
  state.json
  evidence/
  reports/latest.json
  reports/latest.md
```

A real E2E run is complete only when the report is PASS and the stored Blender/Unity evidence corresponds to the expected asset and runtime.
