#!/usr/bin/env python3
"""Opt-in native macOS input+visual response Harness action-v1 adapter.

Real CGEvents (not fake KnifeControlFrame). Requires both Accessibility and
Screen Recording permission plus the player's exact foreground PID/window.
Blocks without permissions, valid ROI or a *visible* game response.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urljoin


def record(outcome, message, **fields):
    print(json.dumps({"outcome": outcome, "summary": message,
                      "metadata": fields}, ensure_ascii=False))


def run(command, timeout=30):
    return subprocess.run(command, text=True, capture_output=True,
                          timeout=timeout, check=False)


def fail(message):
    record("fail", "Native macOS input BLOCKED: " + str(message),
           verified=False, source="native-macos-input")


def image_difference(before, after, region, pixel_threshold):
    try:
        from PIL import Image, ImageChops
    except ImportError as error:
        raise RuntimeError("Pillow required for native input screenshot verification") from error
    with Image.open(before) as source, Image.open(after) as followup:
        start = source.convert("RGB")
        end = followup.convert("RGB")
        if start.size != end.size:
            raise RuntimeError("screenshot dimensions changed during input")
        x,y,w,h = region
        if not (isinstance(x,int) and isinstance(y,int) and
                isinstance(w,int) and isinstance(h,int) and
                x>=0 and y>=0 and w>=64 and h>=64 and
                x+w<=start.width and y+h<=start.height):
            raise RuntimeError("invalid screen-space ROI")
        one = start.crop((x,y,x+w,y+h))
        two = end.crop((x,y,x+w,y+h))
        diff = ImageChops.difference(one,two)
        pixels = diff.getdata()
        changed = sum(1 for rgb in pixels if max(rgb) > pixel_threshold)
        return {"changedPixels": changed, "comparedPixels": w*h,
                "differentFraction": changed/(w*h),
                "screenshotWidth": start.width, "screenshotHeight": start.height}


def main():
    req=json.load(sys.stdin)
    if req.get("protocol")!="ai-3dgame-test-harness/action-v1" or req.get("action")!="native-input":
        raise RuntimeError("unsupported Harness input operation")
    if os.getenv("HARNESS_OS_INPUT_APPROVED")!="1":
        raise RuntimeError("explicit HARNESS_OS_INPUT_APPROVED=1 required")
    data=req.get("input") or {}
    game=Path(data.get("allowedGameRoot","")).expanduser().resolve(strict=True)
    app=Path(data.get("appPath","")).expanduser().resolve(strict=True)
    if app.suffix!=".app" or not app.is_relative_to(game):
        raise RuntimeError("target must be a game .app inside allowed game root")
    pid=data.get("pid")
    if type(pid) is not int or pid<=0:
        raise RuntimeError("must supply exact running Player PID")
    region=data.get("region")
    if not isinstance(region,list) or len(region)!=4 or any(type(v) is not int for v in region):
        raise RuntimeError("screen-space [x,y,width,height] region required")
    action=data.get("gesture")
    if action not in ("key","drag"):
        raise RuntimeError("only native key or drag are allowed")
    driver=Path(__file__).with_name("macos_input_driver.swift")
    if not driver.exists():
        raise RuntimeError("missing macOS driver")
    if not Path("/usr/sbin/screencapture").exists():
        raise RuntimeError("native macOS screencapture unavailable")
    probe=run(["swift",str(driver),"--probe"],timeout=45)
    if probe.returncode!=0:
        raise RuntimeError("Accessibility not authorized: "+probe.stdout[-450:])
    task=str((req.get("task") or {}).get("id",""))
    if not task or "/" in task or ".." in task:
        raise RuntimeError("unsafe Harness task ID")
    attempt=(req.get("state") or {}).get("tasks",{}).get(task,{}).get("attempts",1)
    project=Path(req["projectRoot"]).resolve(strict=True)
    out=project/".project"/"os-input"/task/("attempt-"+str(attempt))
    out.mkdir(parents=True,exist_ok=True)
    before=out/"before.png"
    after=out/"after.png"
    start=time.monotonic()
    cmd=["swift",str(driver),"--pid",str(pid),"--expected-app",str(app)]
    if action=="key":
        key=data.get("keyCode")
        if type(key) is not int or not 0<=key<=127:
            raise RuntimeError("keyCode must be an integer scan code 0..127")
        cmd+=["--key",str(key)]
    else:
        points=data.get("points")
        if (not isinstance(points,list) or len(points)!=4 or
            any(type(x) not in (int,float) or not 0<=x<20000 for x in points)):
            raise RuntimeError("four bounded screen-space drag coordinates required")
        cmd+=["--drag"]
        for k,value in zip(("x0","y0","x1","y1"),points):
            cmd+=["--"+k,str(value)]
    # A screenshot taken while the actual Player is frontmost captures the
    # UI and its interactions, independent of Unity's scripted controller.
    capture1=run(["/usr/sbin/screencapture","-x","-t","png",str(before)],timeout=25)
    if capture1.returncode!=0 or not before.is_file():
        raise RuntimeError("before screenshot unavailable (Screen Recording permission?)")
    issued=run(cmd,timeout=45)
    if issued.returncode!=0:
        raise RuntimeError("macOS rejected native input: "+issued.stdout[-500:]+issued.stderr[-350:])
    payload=json.loads(issued.stdout.splitlines()[-1])
    if payload.get("passed") is not True or payload.get("status")!="SENT":
        raise RuntimeError("CGEvent driver did not confirm dispatch")
    time.sleep(float(data.get("settleSeconds",.5)))
    capture2=run(["/usr/sbin/screencapture","-x","-t","png",str(after)],timeout=25)
    if capture2.returncode!=0 or not after.is_file():
        raise RuntimeError("after screenshot unavailable")
    stats=image_difference(before,after,region,int(data.get("pixelThreshold",12)))
    minimum=float(data.get("minimumChangedFraction",.01))
    if not 0<minimum<=.5:
        raise RuntimeError("minimumChangedFraction must lie within (0,0.5]")
    passed=stats["differentFraction"]>=minimum and stats["changedPixels"]>=100
    report={"source":"native-macos-input","gesture":action,
            "appPath":str(app),"pid":pid,"region":region,"changed":stats,
            "minimumChangedFraction":minimum,"passed":passed,
            "driver":payload,"elapsedSeconds":time.monotonic()-start,
            "createdUnix":time.time(),
            "beforeSha256":hashlib.sha256(before.read_bytes()).hexdigest(),
            "afterSha256":hashlib.sha256(after.read_bytes()).hexdigest()}
    path=out/"native-input-result.json"
    bytes_= (json.dumps(report,indent=2)+"\n").encode()
    path.write_bytes(bytes_)
    sha=hashlib.sha256(bytes_).hexdigest()
    print(json.dumps({"outcome":"pass" if passed else "fail",
      "summary":"native OS game response verified" if passed else
                "native events sent but visual response below threshold",
      "uri":path.as_uri(),
      "metadata":{"verified":passed,"sha256":sha,"source":"native-macos-input",
                  "reportPath":str(path),"screenshots":[str(before),str(after)],
                  "changed":stats}},ensure_ascii=False))


if __name__=="__main__":
    try:
        main()
    except Exception as exc:
        fail(str(exc))
