#!/usr/bin/env python3
"""Strict real Unity Player A4 paper-cut scenario QA (Harness action-v1).

Consumes a scene-generated report, *not* a hypothetical animation spec.
Checks geometry/color/coverage, monotonic cut paths, physical resistance,
persistent pause, real PNG screenshots and distinct existing WAV recordings.
Never creates state, calls Unity, or fakes a successful paper cut.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import wave


def reject(message):
    print(json.dumps({"outcome":"fail", "summary":"Paper-cut QA BLOCKED: "+str(message),
                      "metadata":{"verified":False,"source":"real-macos-unity-player"}},ensure_ascii=False))


def finite_number(obj, key):
    val=obj.get(key)
    if type(val) not in (int,float) or not -1e12<float(val)<1e12:
        raise ValueError("missing/invalid numeric field "+key)
    return float(val)


def secure_file(path, allowed_root):
    p=Path(path).expanduser().resolve(strict=True)
    root=Path(allowed_root).expanduser().resolve(strict=True)
    if not p.is_file() or not p.is_relative_to(root):
        raise ValueError("evidence path missing or outside user-authorized evidence root")
    if p.stat().st_size>30*1024*1024:
        raise ValueError("paper evidence too large (>30MB)")
    return p


def png_size(filename):
    contents=filename.read_bytes()
    if len(contents)<45 or not contents.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("actual Unity paper screenshot missing PNG header")
    import struct
    width,height=struct.unpack(">II",contents[16:24])
    if width<1200 or height<720 or width>16384 or height>16384:
        raise ValueError("invalid game screenshot resolution")
    # Import the shared full PNG decoder by absolute sibling file; tests
    # also load this module with importlib, so rely on no sys.path hacks.
    import importlib.util
    sibling=Path(__file__).with_name("player_qa_runner.py")
    spec=importlib.util.spec_from_file_location("harness_paper_png",sibling)
    if spec is None or spec.loader is None:
        raise ValueError("shared PNG validator unavailable")
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    valid,details=module.validate_png(filename)
    if not valid:
        raise ValueError("PNG integrity error: "+details)
    return [width,height]


def audio_info(filename):
    if filename.suffix.lower()!=".wav":
        raise ValueError("requires real WAV sound evidence for paper tearing")
    try:
        with wave.open(str(filename),"rb") as stream:
            duration=stream.getnframes()/stream.getframerate()
            rate=stream.getframerate()
            channels=stream.getnchannels()
    except Exception as error:
        raise ValueError("invalid WAV recording") from error
    if not .15<=duration<=30 or rate<22050 or channels not in (1,2):
        raise ValueError("invalid tear sound duration/sample rate/channels")
    return {"duration":duration,"rate":rate,"channels":channels}


def verify(report,root,min_cases=3):
    errors=[]
    if report.get("contract")!="RealUnityPaperCut/v1":
        errors.append("missing RealUnityPaperCut/v1 contract")
    if report.get("source")!="real-macos-unity-player":
        errors.append("only actual macOS Player runtime can supply paper evidence")
    commit=report.get("gameCommit")
    if not isinstance(commit,str) or re.fullmatch(r"[a-f0-9]{40}",commit) is None:
        errors.append("missing same-commit game SHA")
    scene=report.get("scene")
    if not isinstance(scene,str) or not scene.endswith(".unity"):
        errors.append("missing concrete Unity scene path")
    paper=report.get("paper")
    if not isinstance(paper,dict):paper={}
    for field,target in (("widthMM",210),("heightMM",297)):
        if paper.get(field)!=target:
            errors.append("A4 actual geometry mismatch: "+field)
    if paper.get("background")!="#46545E":
        errors.append("paper test background != agreed color #46545E")
    ratio=paper.get("screenHeightRatio")
    if type(ratio) not in (float,int) or not .50<=ratio<=.70:
        errors.append("actual paper screen height not 50-70%")
    if paper.get("orientation")!="portrait":
        errors.append("paper not A4 portrait")
    if paper.get("worldPaperMesh") is not True:
        errors.append("no evidence of world paper mesh (2D white block is invalid)")
    trials=report.get("trials")
    if not isinstance(trials,list) or len(trials)<min_cases:
        return {"passed":False,"errors":errors+["missing required dull/medium/sharp trials"],
                "checks":0}
    by_sharpness={}
    summaries={}
    images={}
    sound_hashes={}
    for t in trials:
        if not isinstance(t,dict):errors.append("malformed trial entry");continue
        kind=t.get("sharpness")
        if kind not in ("dull","medium","sharp") or kind in by_sharpness:
            errors.append("duplicate/invalid sharpness trial");continue
        by_sharpness[kind]=t
        path=t.get("samples")
        if not isinstance(path,list) or len(path)<8:
            errors.append(kind+" needs >=8 actual runtime sample frames");continue
        try:
            points=[(finite_number(p,"timeSec"),finite_number(p,"dragProgress"),
                     finite_number(p,"cutProgress"),finite_number(p,"contactForce"),
                     finite_number(p,"deformation")) for p in path]
        except (ValueError,AttributeError) as error:
            errors.append(kind+" invalid sample "+str(error));continue
        times=[p[0] for p in points]
        dragging=[p[1] for p in points]
        cuts=[p[2] for p in points]
        force=[p[3] for p in points]
        deform=[p[4] for p in points]
        if any(times[i]<=times[i-1] for i in range(1,len(times))) or times[-1]<.35:
            errors.append(kind+" non-monotonic/too-short runtime timeline")
        if any(dragging[i]<dragging[i-1]-.0001 for i in range(1,len(dragging))):
            errors.append(kind+" backward drag without explicit rewind")
        if any(cuts[i]<cuts[i-1]-.001 for i in range(1,len(cuts))):
            errors.append(kind+" cut slit reclosed/reversed")
        if any(not 0<=x<=1 for x in dragging+cuts):
            errors.append(kind+" out of range cut progression")
        if max(dragging)<.95:
            errors.append(kind+" gesture did not cover nearly full A4")
        if any(x<0 for x in force+deform):
            errors.append(kind+" negative contact/deformation metric")
        if kind in ("medium","sharp") and t.get("cutSlitConnected") is not True:
            errors.append(kind+" lacks continuous visible tear topology")
        if kind=="dull" and t.get("cutSlitConnected") not in (True,False):
            errors.append("dull paper must explicitly report tear topology")
        paused=t.get("pauseResume")
        if not isinstance(paused,dict) or paused.get("resumed") is not True or            paused.get("heldProgress") is not True:
            errors.append(kind+" pause-resume progress not validated")
        summaries[kind]={"avgForce":sum(force)/len(force),
                         "peakDeformation":max(deform),"finalCut":cuts[-1],
                         "dragMax":max(dragging)}
        try:
            shot=secure_file(t.get("screenshot",""),root)
            images[kind]={"pixels":png_size(shot),
                          "sha256":hashlib.sha256(shot.read_bytes()).hexdigest()}
            wav=secure_file(t.get("tearAudio",""),root)
            audio_info(wav)
            sound_hashes[kind]=hashlib.sha256(wav.read_bytes()).hexdigest()
        except (ValueError,TypeError,OSError) as error:
            errors.append(kind+" invalid media evidence: "+str(error))
    if set(by_sharpness)!={"dull","medium","sharp"}:
        errors.append("must test dull/medium/sharp on same original paper geometry")
    if set(summaries)=={"dull","medium","sharp"}:
        if not summaries["dull"]["avgForce"]>summaries["medium"]["avgForce"]>               summaries["sharp"]["avgForce"]:
            errors.append("dull/medium/sharp contact resistance not differentiated")
        if summaries["dull"]["peakDeformation"]<=summaries["sharp"]["peakDeformation"]:
            errors.append("dull knife paper pressure deformation not visible")
        if summaries["sharp"]["finalCut"]<.95:
            errors.append("sharp blade failed to cut near-full paper")
        if summaries["dull"]["finalCut"]>=summaries["sharp"]["finalCut"]:
            errors.append("dull cut reaches equal/greater progress than sharp")
    if len(set(sound_hashes.values()))<3:
        errors.append("tear sounds not distinct across dull/medium/sharp")
    return {"passed":len(errors)==0,"errors":errors,
            "checks":len(summaries),"scores":summaries,
            "images":images,"audioHashes":sound_hashes}


def main():
    request=json.load(sys.stdin)
    if request.get("protocol")!="ai-3d-game-harness/action-v1" or request.get("action")!="verify-paper-cut":
        raise ValueError("unsupported Harness paper action")
    inp=request.get("input") or {}
    root=Path(inp.get("allowedEvidenceRoot","")).resolve(strict=True)
    document=secure_file(inp.get("reportPath",""),root)
    raw=document.read_bytes()
    report=json.loads(raw)
    expected=inp.get("expectedCommit")
    qa=verify(report,root)
    if not isinstance(expected,str) or not re.fullmatch(r"[a-f0-9]{40}",expected) or report.get("gameCommit")!=expected:
        qa["passed"]=False
        qa["errors"].append("real paper report does not match requested full game commit")
    project=Path(request["projectRoot"]).resolve(strict=True)
    task=str((request.get("task") or {}).get("id",""))
    if not task or "/" in task or ".." in task:raise ValueError("invalid Harness task ID")
    evidence=project/".project"/"paper-qa"/task
    evidence.mkdir(parents=True,exist_ok=True)
    result={"source":"real-macos-unity-player","reportSha256":hashlib.sha256(raw).hexdigest(),
            "reportPath":str(document),"result":qa}
    encoded=(json.dumps(result,indent=2)+"\n").encode()
    path=evidence/("verify-"+hashlib.sha256(encoded).hexdigest()[:16]+".json")
    path.write_bytes(encoded)
    print(json.dumps({
        "outcome":"pass" if qa["passed"] else "fail",
        "summary":"paper-cut 3-state physical/visual/audio QA passed" if qa["passed"]
                  else "paper-cut QA rejected: "+"; ".join(qa["errors"][:12]),
        "uri":path.as_uri(),
        "metadata":{"verified":qa["passed"],
                    "sha256":hashlib.sha256(encoded).hexdigest(),
                    "source":"real-macos-unity-player",
                    "reportPath":str(path),
                    "qa":qa}},ensure_ascii=False))


if __name__=="__main__":
    try:
        main()
    except Exception as error:
        reject(error)
