"""Synthetic fixtures only: prove validator rejects fabricated/impossible cut QA.

Fixtures do NOT count as game evidence. Live Unity Player must emit matching
report plus real PNG/WAV bytes for paper-cut release category.
"""
import copy
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
import wave
import zlib


SOURCE = Path(__file__).resolve().parents[1] / "paper_cut_qa.py"
SPEC = importlib.util.spec_from_file_location("paper_cut_qa", SOURCE)
assert SPEC and SPEC.loader
PAPER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PAPER)


def png(width=1280, height=800):
    def chunk(tag, data):
        body=tag+data
        return struct.pack(">I",len(data))+body+struct.pack(">I",zlib.crc32(body))
    header=struct.pack(">IIBBBBB",width,height,8,6,0,0,0)
    frame=zlib.compress((b"\x00"+b"\xFA\xFA\xFA\xFF"*width)*height)
    return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",header)+chunk(b"IDAT",frame)+chunk(b"IEND",b"")


def valid_report(root):
    cases=[]
    for i,level in enumerate(("dull","medium","sharp")):
        image=root/(level+".png")
        audio=root/(level+".wav")
        image.write_bytes(png())
        with wave.open(str(audio),"wb") as stream:
            stream.setnchannels(1);stream.setsampwidth(2);stream.setframerate(22050)
            stream.writeframes(struct.pack("<h",int(100*i+10))*6000)
        final={"dull":.25,"medium":.7,"sharp":1.0}[level]
        forces={"dull":4.0,"medium":2.5,"sharp":1.0}[level]
        deformation={"dull":.8,"medium":.5,"sharp":.13}[level]
        samples=[
            {"timeSec":.1+step*.2,"dragProgress":step/9,
             "cutProgress":(step/9)*final,
             "contactForce":forces,
             "deformation":deformation*(step/9)} for step in range(10)
        ]
        cases.append({"sharpness":level,"samples":samples,
                      "cutSlitConnected":level!="dull",
                      "pauseResume":{"resumed":True,"heldProgress":True},
                      "screenshot":str(image),"tearAudio":str(audio)})
    return {"contract":"RealUnityPaperCut/v1",
            "source":"real-macos-unity-player",
            "gameCommit":"a"*40,"scene":"Assets/PaperCut.unity",
            "paper":{"widthMM":210,"heightMM":297,
                     "background":"#46545E","orientation":"portrait",
                     "screenHeightRatio":.60,"worldPaperMesh":True},
            "trials":cases}


class PaperValidatorTests(unittest.TestCase):
    def test_synthetic_correct_fixture_is_accepted_for_validator_unit_test_only(self):
        with tempfile.TemporaryDirectory() as root:
            base=Path(root).resolve()
            report=valid_report(base)
            result=PAPER.verify(report,base)
            self.assertTrue(result["passed"],result["errors"])
            self.assertEqual(result["checks"],3)

    def test_missing_game_evidence_never_passes(self):
        with tempfile.TemporaryDirectory() as root:
            base=Path(root).resolve()
            report=valid_report(base)
            report["trials"][0]["screenshot"]=str(base/"missing.png")
            result=PAPER.verify(report,base)
            self.assertFalse(result["passed"])
            self.assertTrue(any("media evidence" in x for x in result["errors"]))

    def test_false_force_order_monotonicity_and_geometry_are_blocked(self):
        with tempfile.TemporaryDirectory() as root:
            base=Path(root).resolve()
            report=valid_report(base)
            report["trials"][0]["samples"][0]["contactForce"]=0
            report["trials"][2]["samples"][3]["cutProgress"]=.8
            report["trials"][2]["samples"][4]["cutProgress"]=.1
            report["paper"]["screenHeightRatio"]=.1
            result=PAPER.verify(report,base)
            self.assertFalse(result["passed"])
            self.assertTrue(any("reclosed" in x for x in result["errors"]))
            self.assertTrue(any("screen height" in x for x in result["errors"]))

    def test_partial_score_without_real_media_is_not_paper_pass(self):
        result=PAPER.verify({"contract":"RealUnityPaperCut/v1",
                             "source":"real-macos-unity-player",
                             "paper":{"widthMM":210,"heightMM":297},
                             "trials":[]},Path("."))
        self.assertFalse(result["passed"])


if __name__=="__main__":
    unittest.main()
