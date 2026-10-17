#!/usr/bin/env python3
"""Create reproducible, privacy-reviewed source+compiled CLI distribution.

No node_modules, local Unity libraries, user data, credentials or .project.
Never publish directly; upload artifact after verifying release hash.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
import re
from pathlib import Path
import subprocess
import tarfile


ROOT=Path(__file__).resolve().parents[1]
ALLOW_TOP={
    "bin","src","dist","scripts","docs","examples","schemas",".github",
    "README.md","STATUS.md","LICENSE","tsconfig.json",
    "package.json","package-lock.json",".gitignore",
}
SKIP_NAMES={"node_modules","__pycache__",".local-pilot",".project",
            ".git",".DS_Store",".env",".env.local"}
SKIP_EXT={".pyc",".pyo",".sqlite",".db",".png",".jpg",".jpeg",".mp4",
          ".mov",".wav",".blend",".app",".log"}
SUSPICIOUS_PATTERNS=[
    r"/Users/[^/\\s]+/",
    r"gho_[A-Za-z0-9]{20,}",
    r"github_pat_[A-Za-z0-9_]{20,}",
    r"sk-[A-Za-z0-9_-]{20,}",
    r"(?i:Bearer[ ]+[A-Za-z0-9_./+-]{32,})",
    r"-----BEGIN[A-Z ]+PRIVATE KEY-----"
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out",type=Path,required=True)
    ap.add_argument("--verify-only",action="store_true")
    args=ap.parse_args()
    out=args.out.expanduser().resolve()
    if out==ROOT or out.is_relative_to(ROOT) and not out.is_relative_to(ROOT/".local-pilot"):
        ap.error("release output must be outside source tree or inside ignored .local-pilot")
    out.mkdir(parents=True,exist_ok=True)
    package=json.loads((ROOT/"package.json").read_text())
    version=package["version"]
    if not version or any(c not in "0123456789abcdefghijklmnopqrstuvwxyz.-" for c in version):
        raise ValueError("invalid release version")
    if not (ROOT/"dist/cli.js").is_file():
        raise ValueError("build dist CLI before packaging")
    prefix="ai-3dgame-test-harness-v"+version
    entries={}
    for top in ALLOW_TOP:
        path=ROOT/top
        if not path.exists():
            continue
        for file in (path.rglob("*") if path.is_dir() else [path]):
            if not file.is_file():
                continue
            rel=file.relative_to(ROOT)
            if any(piece in SKIP_NAMES for piece in rel.parts) or                rel.suffix.lower() in SKIP_EXT:
                continue
            if file.is_symlink():
                raise ValueError("refuse symlink in distributable "+str(rel))
            contents=file.read_bytes()
            if file.stat().st_size>16*1024*1024:
                raise ValueError("unexpected oversized source file "+str(rel))
            if file.suffix in {".ts",".js",".json",".md",".py",".sh",".swift"} and rel!=Path("scripts/make_release.py"):
                # The packager itself contains the literal detector regexes.
                text=contents.decode("utf8",errors="strict")
                for pattern in SUSPICIOUS_PATTERNS:
                    if re.search(pattern,text):
                        raise ValueError("private string in release: "+str(rel)+" / "+pattern)
            entries[str(rel)]=contents
    if not all(x in entries for x in ("dist/cli.js","scripts/bootstrap.sh",
                                     "bin/ai3d-harness","bin/ai3d-test-harness","bin/ai3d-game-test-qa","package-lock.json")):
        raise ValueError("distribution missing essential startup files")
    git_run=subprocess.run(["git","-C",str(ROOT),"rev-parse","HEAD"],
        text=True,capture_output=True,check=False)
    git=git_run.stdout.strip() if git_run.returncode==0 else ""
    # Distribution users can run the packager smoke-test after extracting
    # the release even though there is no .git directory in their tarball.
    if not re.fullmatch(r"[a-f0-9]{40}",git):
        previous=ROOT/"RELEASE_MANIFEST.json"
        if not previous.is_file():
            raise ValueError("no trustworthy source commit in Git or release manifest")
        git=json.loads(previous.read_text()).get("sourceCommit","")
    if not re.fullmatch(r"[a-f0-9]{40}",git):
        raise ValueError("invalid source commit provenance")
    summary={
        "release":version,
        "sourceCommit":git,
        "format":"ai3d-game-harness/release-v1",
        "files":{name:{"sha256":sha(data),"bytes":len(data)} for name,data in sorted(entries.items())},
        "security":"No user private paths, tokens, credentials, Unity Asset Library, App or local evidence",
    }
    entries["RELEASE_MANIFEST.json"]=(json.dumps(summary,indent=2,sort_keys=True)+"\n").encode()
    package_path=out/(prefix+".tar.gz")
    mtime=int(os.getenv("SOURCE_DATE_EPOCH","1700000000"))
    with open(package_path,"wb") as f:
        with gzip.GzipFile(fileobj=f,mode="wb",mtime=0,filename="") as gz:
            with tarfile.open(mode="w",fileobj=gz,format=tarfile.PAX_FORMAT) as archive:
                for filename,data in sorted(entries.items()):
                    item=tarfile.TarInfo(prefix+"/"+filename)
                    item.size=len(data)
                    item.mtime=mtime
                    item.mode=0o755 if filename.startswith("bin/") or filename=="scripts/bootstrap.sh" else 0o644
                    item.uid=item.gid=0
                    item.uname=item.gname=""
                    archive.addfile(item,io.BytesIO(data))
    checksum=sha(package_path.read_bytes())
    (out/"SHA256SUMS").write_text(f"{checksum}  {package_path.name}\n")
    (out/"RELEASE_MANIFEST.json").write_bytes(entries["RELEASE_MANIFEST.json"])
    print("RELEASE_ARCHIVE",str(package_path))
    print("VERSION",version,"FILES",len(entries),"SIZE",package_path.stat().st_size)
    print("SHA256",checksum)
    print("RELEASE_CHECKSUMS",out/"SHA256SUMS")


if __name__=="__main__":
    main()
