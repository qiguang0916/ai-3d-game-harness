#!/usr/bin/env python3
"""Generate PRIVATE, read-only Harness contracts for existing Unity HUD QA files.

The contract uses historical evidence. This is NOT a Unity Editor end-to-end
test. All generated paths stay under --out and should remain gitignored.
"""
import argparse
import json
from pathlib import Path

def write(path: Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--game-root", type=Path, required=True)
    parser.add_argument("--report-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--qa22-summary", type=Path,
                        help="Optional historical scripted native flip/landing JSON")
    parser.add_argument("--branch", required=True)
    parser.add_argument("--unity-version", default="6000.6.3f1")
    args = parser.parse_args()

    game = args.game_root.resolve(strict=True)
    reports = args.report_dir.resolve(strict=True)
    out = args.out.resolve()
    if out == game or game in out.parents:
        raise SystemExit("refusing to create harness state inside the live Unity game worktree")
    contracts = out / "contracts"
    runtime = out / "runtime"
    contracts.mkdir(parents=True, exist_ok=True)
    runtime.mkdir(parents=True, exist_ok=True)
    config = {
        "version": 1,
        "adapters": {
            "qa": {
                "type": "qa-file",
                "actions": ["unity-xml", "png", "json-pass", "json-check",
                            "log-markers", "project-identity"],
                "allowedRoots": [str(game)],
            }
        },
    }
    write(out / "harness.config.json", config)

    def add(task_id, deps, title, action, evidence_type, input_args):
        contract = {
            "id": task_id, "title": title, "goal": title, "kind": "qa",
            "dependencies": deps, "maxAttempts": 1,
            "acceptanceCriteria": [{
                "id": "AC01", "description": title,
                "requiredEvidence": [evidence_type],
                "requireVerifiedEvidence": True,
            }],
            "execution": {"steps": [{
                "id": "verify", "adapter": "qa", "action": action,
                "criterionId": "AC01", "evidenceType": evidence_type,
                "input": input_args,
            }]},
        }
        write(contracts / f"{task_id}.json", contract)

    add("T01-IDENTITY", [], "Read-only Unity branch and version",
        "project-identity", "runtime-observation",
        {"path": str(game / "unity"), "branch": args.branch,
         "unityVersion": args.unity_version})
    add("T02-UNITY", ["T01-IDENTITY"], "Earlier HUD NUnit test run", "unity-xml",
        "test", {"path": str(reports / "color-tests.xml"), "minimumTests": 8})
    add("T03-REGRESSION", ["T01-IDENTITY"], "Earlier HUD regression test run",
        "unity-xml", "test",
        {"path": str(reports / "hud-regression.xml"), "minimumTests": 4})
    for side in "AB":
        add(f"T04-SCREEN-{side}", ["T01-IDENTITY"],
            f"Earlier real Player screenshot side {side}", "png", "screenshot",
            {"path": str(reports / "player-shots" /
                         f"inspection-html-{side}-2880x1800.png"),
             "minWidth": 1440, "minHeight": 900})
    add("T05-COLOR", ["T04-SCREEN-A", "T04-SCREEN-B"],
        "Earlier pixel color parity report", "json-pass", "asset-report",
        {"path": str(reports / "pixel-parity.json"), "minimumItems": 2})
    add("T06-LOG", ["T01-IDENTITY"], "Earlier Player boot and A/B capture log",
        "log-markers", "log",
        {"path": str(reports / "player-qa.log"),
         "mustInclude": ["MINIMUM_LOOP_READY approved=J_KNIFE_OLD_FINAL",
                         "INSPECT_HTML_QA_CAPTURE_A",
                         "INSPECT_HTML_QA_CAPTURE_B"]})
    if args.qa22_summary:
        summary = args.qa22_summary.resolve(strict=True)
        qa22_checks = [
            {"path": key, "operator": "equals", "value": True}
            for key in ("flatFlipSupported", "horizontalYawSupported",
                        "tipLeftFlipSupported")
        ]
        qa22_checks += [
            {"path": key, "operator": "gte", "value": 25}
            for key in ("baseContactTicks", "yawContactTicks",
                        "tipLeftContactTicks")
        ]
        qa22_checks += [
            {"path": "peakPenetrationMetres", "operator": "lt", "value": .002},
            {"path": "unsafeFrames", "operator": "equals", "value": 0},
            {"path": "cameraDriftFrames", "operator": "equals", "value": 0},
            {"path": "errors.length", "operator": "equals", "value": 0},
        ]
        add("T07-FLIP-QA22", ["T01-IDENTITY"],
            "Historical native Rigidbody flip/landing scripted replay",
            "json-check", "test",
            {"path": str(summary), "checks": qa22_checks})
    (out / "README.md").write_text(
        "Historical QA artifact pilot; not a fresh game E2E or current commit proof.\n"
        "All state is written in this private directory; game root remains read-only.\n"
    )
    print(f"CREATED {len(list(contracts.glob('*.json')))} private task contracts at {contracts}")
    print(f"STATE_ONLY_AT {runtime}")

if __name__ == "__main__":
    main()
