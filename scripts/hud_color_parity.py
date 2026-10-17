#!/usr/bin/env python3
"""Reuse the game's existing A/B color regression checker from Harness."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def main():
    req = json.load(sys.stdin)
    if req.get("protocol") != "ai-3dgame-test-harness/action-v1" or req.get("action") != "color-parity":
        raise ValueError("unsupported action")
    data = req.get("input", {})
    game = Path(data.get("gameRoot", "")).resolve(strict=True)
    shots = Path(data.get("shots", "")).resolve(strict=True)
    runtime = Path(req["projectRoot"]).resolve(strict=True)
    if not shots.is_relative_to(runtime):
        raise ValueError("shots must come from this Harness run, not arbitrary filesystem")
    script = game / "scripts" / "inspection-ui" / "check_player_color_parity.py"
    if not script.is_file():
        raise FileNotFoundError("existing game color checker unavailable")
    task = req.get("task", {}).get("id", "")
    if not task or "/" in task or ".." in task:
        raise ValueError("unsafe task id")
    attempt = req.get("state", {}).get("tasks", {}).get(task, {}).get("attempts", 0)
    output_dir = runtime / ".project" / "pixel-qa" / task / f"attempt-{attempt}"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "pixel-parity.json"
    process = subprocess.run(
        [sys.executable, str(script), "--shots", str(shots),
         "--output", str(output_file)],
        capture_output=True, text=True, timeout=40,
    )
    if not output_file.is_file():
        raise ValueError("color parity script produced no data: " + process.stderr[:300])
    raw = output_file.read_bytes()
    report = json.loads(raw)
    passed = (process.returncode == 0 and report.get("all_passed") is True and
              len(report.get("screenshots", [])) == 2 and
              all(x.get("passed") is True for x in report["screenshots"]))
    record = {
        "outcome": "pass" if passed else "fail",
        "summary": "live A/B HUD color parity passed" if passed else "HUD color parity rejected",
        "uri": output_file.as_uri(),
        "metadata": {
            "verified": passed,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "reportPath": str(output_file),
            "screenshots": report.get("screenshots", []),
            "source": "real-macos-player-color-checker",
        },
    }
    print(json.dumps(record, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"outcome": "fail", "summary": "color parity blocked: " + str(exc),
                          "metadata": {"verified": False}}))
