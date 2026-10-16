#!/usr/bin/env python3
"""One-command Second Life Workshop game QA on a user-authorized Mac.

Runs separate real Editor PlayMode and macOS Player QA workflows. Every
failure remains visible. The final report is NOT a release certificate when
OS hardware input, paper cut, or performance evidence is unavailable.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "dist" / "cli.js"


def shell(args, **kwargs):
    return subprocess.run(args, text=True, capture_output=True, **kwargs)


def git(game, *args):
    r = shell(["git", "-C", str(game), *args], timeout=10)
    if r.returncode:
        raise RuntimeError("git command failed: " + r.stderr[-300:])
    return r.stdout.strip()


def editor_pid(project):
    actual = str(project.resolve(strict=True))
    result = shell(["ps", "-axo", "pid=,command="], timeout=10)
    if result.returncode:
        return None
    found = []
    for line in result.stdout.splitlines():
        if "/Unity.app/Contents/MacOS/Unity -projectPath " not in line:
            continue
        if " -adb2 " in line or " -batchmode " in line or " -batchMode " in line:
            continue
        m = re.match(r"\s*(\d+)\s+", line)
        if m and re.search(r"-projectPath\s+" + re.escape(actual) + r"(\s|$)", line):
            found.append(int(m.group(1)))
    return found[0] if len(found) == 1 else None


def owner_bridge_port(pid):
    result = shell(["lsof", "-nP", "-a", "-p", str(pid),
                    "-iTCP", "-sTCP:LISTEN"], timeout=10)
    if result.returncode:
        return None
    ports = set()
    for line in result.stdout.splitlines():
        match = re.search(r"127\.0\.0\.1:(64\d\d)\s+\(LISTEN\)", line)
        if match:
            ports.add(int(match.group(1)))
    return next(iter(ports)) if len(ports) == 1 else None


def command(label, args, output):
    started = time.monotonic()
    result = shell(args, timeout=600, cwd=ROOT)
    output.write_text(result.stdout + "\nSTDERR\n" + result.stderr)
    print(f"{label}: exit={result.returncode}, seconds={round(time.monotonic()-started,1)}",
          flush=True)
    return result.returncode


def make_live_contracts(game, target, work, port, branch, test_names):
    cmd = [sys.executable, str(ROOT / "scripts/init_live_unity_pilot.py"),
           "--game-root", str(game), "--out", str(work), "--bridge-port", str(port),
           "--branch", branch, "--test-class", test_names[0], "--minimum-tests", "1"]
    run = shell(cmd, timeout=20)
    if run.returncode:
        raise RuntimeError("Editor pilot generator failed: " + run.stderr)
    for i, name in enumerate(test_names[1:], start=2):
        task_id = f"T0{i}-LIVE-TEST"
        task = {
            "id": task_id, "title": "Live Unity PlayMode: " + name,
            "goal": "Complete and verify all tests in " + name,
            "kind": "qa", "dependencies": ["T01-EDITOR-IDENTITY"],
            "maxAttempts": 1,
            "acceptanceCriteria": [{
                "id": "A1", "description": "Live test completed",
                "requiredEvidence": ["test"], "requireVerifiedEvidence": True,
            }],
            "execution": {"steps": [{
                "id": "run", "adapter": "editor", "action": "run-tests",
                "criterionId": "A1", "evidenceType": "test",
                "input": {"mode": "PlayMode", "testNames": [name],
                          "minimumTests": 1, "maxWaitMs": 240000},
            }]},
        }
        (work / "contracts" / (task_id + ".json")).write_text(
            json.dumps(task, indent=2) + "\n"
        )


def make_player_contracts(game, app, work, dev_app):
    cmd = [sys.executable, str(ROOT / "scripts/init_player_pilot.py"),
           "--game-root", str(game), "--app", str(app), "--out", str(work)]
    run = shell(cmd, timeout=20)
    if run.returncode:
        raise RuntimeError("Player pilot generator failed: " + run.stderr)
    config_path = work / "config.json"
    cfg = json.loads(config_path.read_text())
    cfg["adapters"]["hud-color"] = {
        "type": "json-process", "command": sys.executable,
        "args": [str(ROOT / "scripts/hud_color_parity.py")],
        "actions": ["color-parity"], "timeoutMs": 65000,
    }
    config_path.write_text(json.dumps(cfg, indent=2) + "\n")
    color = {
        "id": "T-PLAYER-COLOR",
        "title": "Color parity from fresh macOS Player capture",
        "goal": "Compare both sides to the same live rust palette",
        "kind": "qa", "dependencies": ["T-PLAYER-AB"], "maxAttempts": 1,
        "acceptanceCriteria": [{
            "id": "C", "description": "A/B pixel status identity",
            "requiredEvidence": ["asset-report"], "requireVerifiedEvidence": True,
        }],
        "execution": {"steps": [{
            "id": "verify", "adapter": "hud-color", "action": "color-parity",
            "criterionId": "C", "evidenceType": "asset-report",
            "input": {"gameRoot": str(game),
                      "shots": {"$from": "dependencies.T-PLAYER-AB.latestByType.runtime-observation.metadata.outputDirectory"}},
        }]},
    }
    (work / "contracts" / "color.json").write_text(json.dumps(color, indent=2) + "\n")
    if dev_app is None:
        return
    for scenario in ("replay-qa19", "replay-qa22"):
        name = "T-" + scenario.upper()
        task = {
            "id": name, "title": "Fresh graphical " + scenario,
            "goal": "Run native Unity physics with scripted control router",
            "kind": "qa", "dependencies": [], "maxAttempts": 1,
            "acceptanceCriteria": [{
                "id": "A1", "description": "Native physics replay is verified",
                "requiredEvidence": ["runtime-observation"],
                "requireVerifiedEvidence": True,
            }],
            "execution": {"steps": [{
                "id": "replay", "adapter": "player", "action": scenario,
                "criterionId": "A1", "evidenceType": "runtime-observation",
                "input": {"appPath": str(dev_app),
                          "allowedGameRoot": str(game),
                          "timeoutSeconds": 220},
            }]},
        }
        (work / "contracts" / (name + ".json")).write_text(
            json.dumps(task, indent=2) + "\n"
        )


def module_report(work):
    path = work / "runtime" / ".project" / "reports" / "latest.json"
    if not path.is_file():
        return {"passed": False, "reason": "missing completed Harness report"}
    return json.loads(path.read_text())


def accessibility():
    swift = shutil.which("swift")
    if swift is None:
        return {"status": "BLOCKED", "reason": "Swift/Quartz not installed"}
    try:
        call = shell([swift, "-e",
                      'import ApplicationServices; print(AXIsProcessTrusted())'],
                     timeout=30)
        trusted = call.returncode == 0 and call.stdout.strip().lower() == "true"
        return {
            "status": "READY" if trusted else "BLOCKED",
            "reason": "" if trusted else "macOS Accessibility permission for native input not granted",
        }
    except Exception as exc:
        return {"status": "BLOCKED", "reason": str(exc)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--game-root", type=Path, required=True)
    parser.add_argument("--app", type=Path)
    parser.add_argument("--dev-app", type=Path)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--bridge-port", type=int)
    parser.add_argument("--mode", choices=["editor","player","all"], default="all")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--release-manifest", type=Path,
                        help="Optional strict same-commit release evidence manifest")
    parser.add_argument("--test-class", action="append", default=[])
    parser.add_argument("--launch-editor", action="store_true")
    args = parser.parse_args()

    game = args.game_root.resolve(strict=True)
    target = (game / "unity").resolve(strict=True)
    out = args.out.resolve()
    if out == game or out.is_relative_to(game):
        parser.error("refusing Harness writes inside game source")
    out.mkdir(parents=True, exist_ok=True)
    commit = git(game, "rev-parse", "HEAD")
    branch = git(game, "branch", "--show-current")
    expected = args.branch
    if branch != expected:
        parser.error(f"wrong target game branch {branch}, expected {expected}")
    if not CLI.is_file():
        parser.error("Harness not built. Run npm install && npm test first.")
    result = {
        "version": "v0.2 game QA", "gameRoot": str(game),
        "branch": branch, "gitHead": commit,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "modules": {}, "accessibility": accessibility(),
        "release": {"status": "BLOCKED", "reason": "OS native input, paper-cut, and perf are independent gates"},
    }
    if args.mode in ("editor", "all"):
        pid = editor_pid(target)
        if pid is None and args.launch_editor:
            app = Path("/Applications/Unity/Hub/Editor/6000.6.3f1/Unity.app")
            if not app.exists():
                parser.error("Unity Editor 6000.6.3f1 not installed")
            shell(["open", "-n", "-a", str(app), "--args", "-projectPath", str(target)],
                  timeout=20)
            for _ in range(120):
                pid = editor_pid(target)
                if pid is not None and owner_bridge_port(pid):
                    break
                time.sleep(1)
        if pid is None:
            result["modules"]["editor"] = {"passed": False, "reason": "target Editor not running"}
        else:
            port = args.bridge_port or owner_bridge_port(pid)
            if port is None:
                result["modules"]["editor"] = {"passed": False, "reason": "no unique Coplay bridge on target Editor PID"}
            else:
                work = out / "editor"
                tests = args.test_class or ["KnifeBladeInspectionConditionV4Tests"]
                make_live_contracts(game,target,work,port,branch,tests)
                pre = command("EDITOR_PREFLIGHT",
                    ["node", str(CLI), "preflight", str(work/"contracts"),
                     str(work/"harness.config.json")], out/"editor-preflight.log")
                if pre:
                    result["modules"]["editor"] = {"passed": False, "reason": "preflight failed"}
                else:
                    code = command("EDITOR_DAG",
                        ["node", str(CLI), "run-project", str(work/"runtime"),
                         str(work/"contracts"),str(work/"harness.config.json")],
                        out/"editor-run.log")
                    result["modules"]["editor"] = {"passed": code == 0,
                                                   "report": module_report(work)}
    if args.mode in ("player", "all"):
        if args.app is None:
            result["modules"]["player"] = {"passed": False, "reason": "missing --app"}
        else:
            app = args.app.resolve(strict=True)
            dev_app = args.dev_app.resolve(strict=True) if args.dev_app else None
            work = out / "player"
            make_player_contracts(game,app,work,dev_app)
            pre = command("PLAYER_PREFLIGHT",
                ["node",str(CLI),"preflight",str(work/"contracts"),
                 str(work/"config.json")],out/"player-preflight.log")
            if pre:
                result["modules"]["player"] = {"passed": False, "reason": "preflight failed"}
            else:
                code = command("PLAYER_DAG",
                    ["node",str(CLI),"run-project",str(work/"runtime"),
                     str(work/"contracts"),str(work/"config.json")],
                    out/"player-run.log")
                result["modules"]["player"] = {"passed": code == 0,
                                               "report": module_report(work)}
    if args.release_manifest:
        release_path=args.release_manifest.resolve(strict=True)
        release_run=shell(["node",str(CLI),"release-gate",str(release_path)],
                          timeout=35,cwd=ROOT)
        (out/"release-gate.log").write_text(release_run.stdout+"\\n"+release_run.stderr)
        result["release"]={"status":"PASS" if release_run.returncode==0 else "BLOCKED",
          "source":str(release_path),"gateExit":release_run.returncode}
    result["passedModules"] = sum(
        bool(v.get("passed")) for v in result["modules"].values()
    )
    result["failedModules"] = [
        k for k,v in result["modules"].items() if not v.get("passed")
    ]
    result["allRequestedTestsPassed"] = bool(result["modules"]) and not result["failedModules"]
    outfile = out / "GAME_QA_REPORT.json"
    outfile.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    markdown = [
        "# Automated Game QA", "",
        f"Branch: `{branch}` · commit: `{commit[:12]}`", "",
        "| Module | Status |", "| --- | --- |"
    ]
    for key,val in result["modules"].items():
        markdown.append(f"| {key} | {'PASS' if val.get('passed') else 'FAIL/BLOCKED'} |")
    markdown += ["", "## Release decision", "",
                 "**"+result["release"]["status"]+"**: "
                 +("all mandatory release evidence verified" if result["release"]["status"]=="PASS"
                    else "OS native input, paper-cut, performance, GPU/editor and non-Development evidence must all be verified from the same commit."),
                 "", f"Raw report: {outfile}"]
    (out/"GAME_QA_REPORT.md").write_text("\n".join(markdown)+"\n")
    print("GAME_QA_REPORT="+str(outfile))
    print("MODULES="+json.dumps({k:v.get("passed") for k,v in result["modules"].items()}))
    print("RELEASE="+result["release"]["status"])
    if result["failedModules"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
