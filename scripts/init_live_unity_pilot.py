#!/usr/bin/env python3
"""Generate a private Harness DAG bound to an exact already-running Unity Editor.

No global MCP config changes, no arbitrary Unity action; only identity and
explicitly named PlayMode tests. Write to an ignored sandbox outside game root.
"""
import argparse
import json
import shutil
from pathlib import Path


def write(path, obj):
    path.write_text(json.dumps(obj, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--game-root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--bridge-port", required=True, type=int)
    parser.add_argument("--unity-version", default="6000.6.3f1")
    parser.add_argument("--test-class", required=True)
    parser.add_argument("--minimum-tests", type=int, default=1)
    args = parser.parse_args()
    game = args.game_root.resolve(strict=True)
    target = (game / "unity").resolve(strict=True)
    out = args.out.resolve()
    if out == game or game in out.parents:
        raise SystemExit("refusing to write harness inside the live Unity project")
    if args.bridge_port < 1 or args.bridge_port > 65535:
        raise SystemExit("invalid TCP bridge port")
    if args.minimum_tests < 1:
        raise SystemExit("minimum-tests must be >=1")
    uvx = shutil.which("uvx")
    if not uvx:
        raise SystemExit("uvx not installed")
    contracts = out / "contracts"
    runtime = out / "runtime"
    contracts.mkdir(parents=True, exist_ok=True)
    runtime.mkdir(parents=True, exist_ok=True)
    config = {
        "version": 1,
        "adapters": {
            "qa": {
                "type": "qa-file",
                "actions": ["project-identity"],
                "allowedRoots": [str(game)],
            },
            "editor": {
                "type": "unity-editor",
                "command": uvx,
                "args": [
                    "--from", "mcpforunityserver==10.2.0",
                    "mcp-for-unity", "--transport", "stdio",
                ],
                "env": {
                    "UNITY_MCP_SKIP_STARTUP_CONNECT": "1",
                    "DISABLE_TELEMETRY": "1",
                },
                "projectPath": str(target),
                "bridgePort": args.bridge_port,
                "timeoutMs": 120000,
                "actions": ["run-tests", "read-console", "inspect-scene"],
            },
        },
    }
    write(out / "harness.config.json", config)

    def task(task_id, dependencies, name, adapter, action, evidence, params):
        write(contracts / (task_id + ".json"), {
            "id": task_id,
            "title": name,
            "goal": name,
            "kind": "qa",
            "dependencies": dependencies,
            "maxAttempts": 1,
            "acceptanceCriteria": [{
                "id": "AC01",
                "description": name,
                "requiredEvidence": [evidence],
                "requireVerifiedEvidence": True,
            }],
            "execution": {"steps": [{
                "id": "verify", "adapter": adapter, "action": action,
                "criterionId": "AC01", "evidenceType": evidence,
                "input": params,
            }]},
        })

    task("T01-EDITOR-IDENTITY", [], "Exact Unity Editor must own bound port",
         "qa", "project-identity", "runtime-observation",
         {"path": str(target), "branch": args.branch,
          "unityVersion": args.unity_version, "requireEditor": True})
    task("T02-LIVE-UNITY-TESTS", ["T01-EDITOR-IDENTITY"],
         "MCP starts, polls, and verifies completed PlayMode tests",
         "editor", "run-tests", "test",
         {"mode": "PlayMode", "testNames": [args.test_class],
          "minimumTests": args.minimum_tests, "maxWaitMs": 240000})
    (out / "README.md").write_text(
        "# Bound Unity MCP live test pilot\n\n"
        "Runs real PlayMode tests on the exact Editor verified by "
        "projectPath and bridgePort owner PID.\n"
        "No changes to global Codex configuration or game source.\n"
    )
    print("LIVE_UNITY_PILOT_CREATED", str(out))
    print("EDITOR_BRIDGE_PORT", args.bridge_port)


if __name__ == "__main__":
    main()
