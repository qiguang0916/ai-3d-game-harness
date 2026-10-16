#!/usr/bin/env python3
"""Offline release archive verifier (path traversal and hashes included)."""
import argparse
import gzip
import io
import hashlib
import json
from pathlib import PurePosixPath,Path
import tarfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify(path):
    archive=Path(path).expanduser().resolve(strict=True)
    if not archive.is_file() or not archive.name.endswith(".tar.gz"):
        raise ValueError("release must be a .tar.gz file")
    # Fully decode gzip and verify its CRC/trailer BEFORE opening the TAR.
    # tarfile alone may stop at the last TAR member and ignore a broken
    # gzip trailer; never treat that as verified delivery integrity.
    with gzip.open(archive,"rb") as gz:
        decoded=gz.read(128*1024*1024+1)
    if len(decoded)>128*1024*1024:
        raise ValueError("release uncompressed TAR size exceeds 128MiB")
    files={}
    with tarfile.open(fileobj=io.BytesIO(decoded),mode="r:") as tar:
        for entry in tar.getmembers():
            path=PurePosixPath(entry.name)
            if not entry.isfile() or path.is_absolute() or ".." in path.parts or len(path.parts)<2:
                raise ValueError("unsafe tar member "+str(path))
            if entry.size>16*1024*1024:
                raise ValueError("oversized release member")
            if entry.name in files:
                raise ValueError("duplicate release member")
            obj=tar.extractfile(entry)
            if obj is None:
                raise ValueError("missing tar entry")
            files[entry.name]=obj.read()
    manifests=[name for name in files if name.endswith("/RELEASE_MANIFEST.json")]
    if len(manifests)!=1:
        raise ValueError("release missing exactly one manifest")
    manifest_name=manifests[0]
    prefix=manifest_name.removesuffix("/RELEASE_MANIFEST.json")
    metadata=json.loads(files[manifest_name])
    expected=metadata.get("files")
    if not isinstance(expected,dict) or not expected:
        raise ValueError("bad release manifest")
    actual_names={name.removeprefix(prefix+"/") for name in files if name!=manifest_name}
    if set(expected)!=actual_names:
        raise ValueError("file list differs from manifest")
    for key,entry in expected.items():
        payload=files[prefix+"/"+key]
        if sha(payload)!=entry.get("sha256") or len(payload)!=entry.get("bytes"):
            raise ValueError("release member tampered: "+key)
        if any(x in key for x in ("node_modules",".local-pilot",".project",".env",".git/")):
            raise ValueError("private artifact leaked: "+key)
    checksum=sha(archive.read_bytes())
    return {"verified":True,"sha256":checksum,
            "version":metadata.get("release"),"files":len(expected),
            "size":archive.stat().st_size}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("archive")
    args=ap.parse_args()
    report=verify(args.archive)
    print(json.dumps(report,indent=2))


if __name__=="__main__":
    main()
