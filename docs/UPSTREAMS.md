# Upstream projects and reuse policy

The harness is its own codebase. We will reuse compatible components only where that is clearly better than rebuilding them.

## Primary references

### ilezhnin/gamedev-ai-agents
MIT licensed.

Use as a reference for:
- repo-persistent planning state
- gated game-development stages
- Unity-oriented agent roles
- evidence-first delivery discipline

### tykisgod/quick-question
MIT licensed.

Use as a reference for:
- compile/test/runtime feedback loops
- work-mode state
- Unity control-plane patterns
- structured on-disk status

### MRCalderon3D/everything-game-dev-code
MIT licensed.

Use as a reference library for:
- rules/skills/agent organization
- engine isolation
- harness portability
- MCP configuration patterns

## Policy

- Do not copy whole repositories into this project.
- Prefer adapters around mature external MCP/runtime tools.
- Preserve copyright notices for any code that is actually reused.
- Keep the harness source of truth unified and engine-neutral where possible.
