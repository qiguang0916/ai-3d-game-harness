#!/usr/bin/env python3
"""Explicit opt-in macOS Unity Player QA adapter (stdin action-v1 JSON).

This controls a *real* graphical Player. It does not simulate OS mouse
actions and does not repackage or edit the Unity project. QA19/QA22 are only
available in Editor/Development builds and must not be called on release apps.
"""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import signal
import subprocess
import sys
import time
import zlib
import struct
from urllib.parse import quote


def output(outcome, summary, **metadata):
    print(json.dumps({"outcome": outcome, "summary": summary,
                      "uri": metadata.pop("uri", None),
                      "metadata": metadata}, ensure_ascii=False))


def checked_app(path, allowed_root):
    app = Path(path).expanduser().resolve(strict=True)
    root = Path(allowed_root).expanduser().resolve(strict=True)
    if app.suffix != ".app" or not app.is_relative_to(root):
        raise ValueError("app must be an existing .app inside allowedGameRoot")
    data = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    exe_name = data.get("CFBundleExecutable")
    if not isinstance(exe_name, str):
        raise ValueError("missing signed app executable name")
    executable = app / "Contents/MacOS" / exe_name
    if not executable.is_file():
        raise ValueError("missing macOS Player executable")
    return app, executable


def find_launched_pid(executable, output_directory):
    listing = subprocess.check_output(["ps", "-axo", "pid=,command="], text=True)
    hits = []
    for line in listing.splitlines():
        if str(executable) in line and str(output_directory) in line:
            match = re.match(r"\s*(\d+)\s+", line)
            if match:
                hits.append(int(match.group(1)))
    return hits[0] if len(hits) == 1 else None


def focus(pid):
    try:
        subprocess.run(
            ["osascript", "-e",
             f'tell application "System Events" to set frontmost of (first process whose unix id is {pid}) to true'],
            timeout=10, check=True, capture_output=True,
        )
        return True
    except Exception:
        return False


def validate_png(path):
    data = path.read_bytes()
    if len(data) < 80 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return False, "invalid PNG signature"
    w, h = struct.unpack(">II", data[16:24])
    if w < 800 or h < 500:
        return False, f"PNG too small: {w}x{h}"
    offset = 8
    compressed = bytearray()
    finished = False
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        end = offset + 8 + length
        if end + 4 > len(data):
            return False, "truncated PNG chunk"
        tag = data[offset + 4:offset + 8]
        checksum = struct.unpack(">I", data[end:end + 4])[0]
        if zlib.crc32(data[offset + 4:end]) != checksum:
            return False, "PNG CRC mismatch"
        if tag == b"IDAT":
            compressed.extend(data[offset + 8:end])
        offset = end + 4
        if tag == b"IEND":
            finished = offset == len(data)
            break
    if not finished:
        return False, "missing PNG IEND"
    try:
        if not zlib.decompress(bytes(compressed)):
            return False, "empty pixel stream"
    except zlib.error:
        return False, "corrupt PNG compressed pixels"
    return True, f"{w}x{h}"


def write_manifest(outdir, report):
    path = outdir / "player-qa-manifest.json"
    raw = (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode()
    path.write_bytes(raw)
    return path, hashlib.sha256(raw).hexdigest()


def evaluate_replay(action, summary):
    errors = []
    if summary.get("errors"):
        errors.append("reported runtime errors: " + str(summary["errors"])[:400])
    if action == "replay-qa22":
        for key in ("flatFlipSupported", "horizontalYawSupported",
                    "tipLeftFlipSupported"):
            if summary.get(key) is not True:
                errors.append(f"{key} failed")
        for key in ("baseContactTicks", "yawContactTicks",
                    "tipLeftContactTicks"):
            if summary.get(key, 0) < 25:
                errors.append(f"{key} insufficient")
        if summary.get("peakPenetrationMetres", 10) >= .002:
            errors.append("excessive body penetration")
        if summary.get("unsafeFrames", 1) != 0:
            errors.append("unsafe rendered frames")
        if summary.get("cameraDriftFrames", 1) != 0:
            errors.append("camera drift frames")
    elif action == "replay-qa19":
        for key in ("leftPassed", "rightPassed", "inspectYawPassed",
                    "inspectRollPassed", "returnPassed"):
            if summary.get(key) is not True:
                errors.append(f"{key} failed")
        if summary.get("peakPenetrationMetres", 10) >= .002:
            errors.append("excessive penetration")
        if summary.get("unsafeRenderFrames", 1) != 0:
            errors.append("unsafe rendering")
    return errors


def main():
    request = json.load(sys.stdin)
    if request.get("protocol") != "ai-3d-game-harness/action-v1":
        raise ValueError("unsupported Harness action protocol")
    action = request.get("action")
    if action not in ("capture-hud", "replay-qa22", "replay-qa19"):
        raise ValueError("forbidden player action")
    value = request.get("input") or {}
    app, exe = checked_app(value.get("appPath", ""), value.get("allowedGameRoot", ""))
    project = Path(request["projectRoot"]).resolve(strict=True)
    task_id = str(request.get("task", {}).get("id", ""))
    if not re.fullmatch(r"[A-Za-z0-9._-]+", task_id):
        raise ValueError("invalid Harness task id")
    attempt = int(request.get("state", {}).get("tasks", {})
                  .get(task_id, {}).get("attempts", 0))
    outdir = project / ".project" / "player-qa" / task_id / f"attempt-{attempt}"
    outdir.mkdir(parents=True, exist_ok=True)
    log = outdir / "unity-player.log"
    timeout_s = max(15, min(600, int(value.get("timeoutSeconds", 100))))
    mode_flags = {
        "capture-hud": ["-inspectHtmlQaCapture", "-minimumEvidenceDir", str(outdir)],
        "replay-qa22": ["-knifeQa22FlipDir", str(outdir)],
        "replay-qa19": ["-knifeQa19Dir", str(outdir)],
    }
    command = ["open", "-n", "-a", str(app), "--args",
               *mode_flags[action], "-logFile", str(log),
               "-screen-width", str(int(value.get("width", 1440))),
               "-screen-height", str(int(value.get("height", 900)))]
    started = time.time()
    subprocess.run(command, timeout=25, check=True, capture_output=True)
    pid = None
    focus_attempted = False
    visual = {}
    summary = None
    outcome = "fail"
    failure = ""
    expected_files = {
        "capture-hud": ["inspection-html-A-2880x1800.png",
                        "inspection-html-B-2880x1800.png"],
        "replay-qa19": ["qa19-summary.json"],
        "replay-qa22": ["qa22-flip-summary.json"],
    }[action]
    try:
        while time.time() - started < timeout_s:
            time.sleep(.75)
            if pid is None:
                pid = find_launched_pid(exe, outdir)
            if pid and not focus_attempted:
                focus_attempted = True
                focus(pid)
            if not all((outdir / name).exists() for name in expected_files):
                continue
            if action == "capture-hud":
                for filename in expected_files:
                    valid, detail = validate_png(outdir / filename)
                    if not valid:
                        failure = filename + ": " + detail
                        break
                    raw = (outdir / filename).read_bytes()
                    visual[filename] = {"bytes": len(raw),
                                        "sha256": hashlib.sha256(raw).hexdigest(),
                                        "dimensions": detail}
                if failure:
                    continue
                logs = log.read_text(errors="replace") if log.exists() else ""
                if not all(marker in logs for marker in
                           ("INSPECT_HTML_QA_CAPTURE_A", "INSPECT_HTML_QA_CAPTURE_B",
                            "MINIMUM_LOOP_READY")):
                    continue
                outcome = "pass"
                break
            name = expected_files[0]
            if time.time() - (outdir / name).stat().st_mtime > 3:
                summary = json.loads((outdir / name).read_text())
                issues = evaluate_replay(action, summary)
                if issues:
                    failure = "; ".join(issues)
                else:
                    outcome = "pass"
                break
        if outcome != "pass" and not failure:
            failure = f"missing completed {action} evidence by {timeout_s}s"
    finally:
        if pid:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    result = {
        "source": "real-macos-unity-player",
        "mode": action,
        "appPath": str(app),
        "playerPid": pid,
        "focused": focus_attempted,
        "startedUnix": started,
        "finishedUnix": time.time(),
        "result": outcome,
        "failure": failure,
        "images": visual,
        "summary": summary,
        "playerLog": str(log),
    }
    manifest, sha = write_manifest(outdir, result)
    output(outcome,
           f"{action} captured {len(visual)} images" if outcome == "pass"
           else f"{action} blocked: {failure}",
           uri=manifest.as_uri(), verified=outcome=="pass", sha256=sha,
           manifest=str(manifest), outputDirectory=str(outdir),
           imagePaths={key:str(outdir / key) for key in visual},
           imageAPath=str(outdir / "inspection-html-A-2880x1800.png") if action=="capture-hud" else None,
           imageBPath=str(outdir / "inspection-html-B-2880x1800.png") if action=="capture-hud" else None,
           mode=action)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        output("fail", "Unity Player runner blocked: " + str(exc),
               verified=False, errorType=type(exc).__name__)
