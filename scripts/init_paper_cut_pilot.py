#!/usr/bin/env python3
"""Private strict RealUnityPaperCut/v1 evidence DAG, no screenshot fabrication.

The game/paper-cut worktree must generate the external JSON, PNG and WAV.
A logical CutTestEvaluator result alone is not sufficient for visual release.
"""
import argparse
import json
from pathlib import Path
import shutil
import sys


def write(path,body):
    path.write_text(json.dumps(body,ensure_ascii=False,indent=2)+"\n")


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--report",type=Path,required=True)
    parser.add_argument("--evidence-root",type=Path,required=True)
    parser.add_argument("--out",type=Path,required=True)
    parser.add_argument("--expected-commit",required=True)
    args=parser.parse_args()
    parent=args.evidence_root.expanduser().resolve(strict=True)
    report=args.report.expanduser().resolve(strict=True)
    out=args.out.expanduser().resolve()
    if not report.is_relative_to(parent):
        parser.error("report must be inside allowed evidence root")
    if out==parent or out.is_relative_to(parent):
        parser.error("Harness runtime output must be separate from game evidence")
    if len(args.expected_commit)!=40:
        parser.error("expected commit must be full SHA")
    contracts=out/"contracts"
    contracts.mkdir(parents=True,exist_ok=True)
    (out/"runtime").mkdir(exist_ok=True)
    script=Path(__file__).with_name("paper_cut_qa.py")
    config={"version":1,"adapters":{"paper":{
        "type":"json-process","command":sys.executable,
        "args":[str(script)],"actions":["verify-paper-cut"],"timeoutMs":90000
    }}}
    write(out/"config.json",config)
    contract={"id":"T-PAPER-REAL","title":"A4 real Player cutting, physical, visual, sound QA",
      "goal":"Reject real-game paper if dull/medium/sharp differential evidence is missing",
      "kind":"qa","dependencies":[],"maxAttempts":1,
      "acceptanceCriteria":[{"id":"A1","description":"Real cut media, topology, force and audio",
        "requiredEvidence":["runtime-observation"],"requireVerifiedEvidence":True}],
      "execution":{"steps":[{"id":"validate","adapter":"paper",
        "action":"verify-paper-cut","criterionId":"A1",
        "evidenceType":"runtime-observation",
        "input":{"reportPath":str(report),
                 "allowedEvidenceRoot":str(parent),
                 "expectedCommit":args.expected_commit}
      }]}}
    write(contracts/"paper.json",contract)
    print("REAL_PAPER_EVIDENCE_CONTRACT",str(contracts))


if __name__=="__main__":
    main()
