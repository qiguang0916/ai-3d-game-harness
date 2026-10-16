#!/usr/bin/env python3
"""Private macOS Player capture DAG (real graphical Player, read-only project)."""
import argparse
import json
import shutil
from pathlib import Path


def save(path, body):
    path.write_text(json.dumps(body, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--game-root", type=Path, required=True)
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    game = args.game_root.resolve(strict=True)
    app = args.app.resolve(strict=True)
    out = args.out.resolve()
    if not app.is_relative_to(game):
        raise SystemExit("App must be inside explicitly supplied game root")
    if out == game or out.is_relative_to(game):
        raise SystemExit("Harness runtime may not write inside Unity game root")
    (out / "contracts").mkdir(parents=True, exist_ok=True)
    (out / "runtime").mkdir(exist_ok=True)
    script = (Path(__file__).resolve().parent / "player_qa_runner.py")
    config = {"version": 1, "adapters": {
        "player": {"type": "json-process",
                   "command": shutil.which("python3") or "python3",
                   "args": [str(script)], "timeoutMs": 180000,
                   "actions": ["capture-hud", "replay-qa19", "replay-qa22"]},
        "files": {"type": "qa-file", "actions": ["png","image-diff"],
                  "allowedRoots": [str(game)]}
    }}
    save(out / "config.json", config)
    entry = {"id": "T-PLAYER-AB", "title": "Capture actual macOS Unity Player A/B",
             "goal": "Prove real Player renders both inspection faces",
             "kind": "qa", "dependencies": [], "maxAttempts": 1,
             "acceptanceCriteria": [
                 {"id": key, "description": title,
                  "requiredEvidence": [kind], "requireVerifiedEvidence": True}
                 for key, title, kind in (
                     ("RUN", "Managed Player session", "runtime-observation"),
                     ("FACE-A", "A-side real PNG", "screenshot"),
                     ("FACE-B", "B-side real PNG", "screenshot"))
             ],
             "execution": {"steps": [
                 {"id": "capture", "adapter": "player", "action": "capture-hud",
                  "criterionId": "RUN", "evidenceType": "runtime-observation",
                  "input": {"appPath": str(app),
                            "allowedGameRoot": str(game),
                            "timeoutSeconds": 100}},
                 {"id": "A", "adapter": "files", "action": "png",
                  "criterionId": "FACE-A", "evidenceType": "screenshot",
                  "input": {"path": {"$from": "steps.capture.metadata.imageAPath"},
                            "minWidth": 1440, "minHeight": 900}},
                 {"id": "B", "adapter": "files", "action": "png",
                  "criterionId": "FACE-B", "evidenceType": "screenshot",
                  "input": {"path": {"$from": "steps.capture.metadata.imageBPath"},
                            "minWidth": 1440, "minHeight": 900}}
             ]}}
    save(out / "contracts" / "capture.json", entry)
    print("PLAYER_PILOT_READY", str(out))


if __name__ == "__main__":
    main()
