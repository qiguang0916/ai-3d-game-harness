"""Native input fail-closed tests; do not generate actual macOS CGEvents."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT=Path(__file__).resolve().parents[1]/"native_input_qa.py"
SPEC=importlib.util.spec_from_file_location("native_input_qa",SCRIPT)
assert SPEC and SPEC.loader
NATIVE=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(NATIVE)


class NativeInputTests(unittest.TestCase):
    def test_no_user_authorization_denies_without_emitting_events(self):
        with tempfile.TemporaryDirectory() as root:
            env=dict(os.environ)
            env.pop("HARNESS_OS_INPUT_APPROVED",None)
            r=subprocess.run([sys.executable,str(SCRIPT)],
                input=json.dumps({"protocol":"ai-3dgame-test-harness/action-v1",
                                  "action":"native-input","projectRoot":root,
                                  "input":{}}),
                text=True,capture_output=True,env=env,timeout=15)
            self.assertEqual(r.returncode,0)
            outcome=json.loads(r.stdout.strip())
            self.assertEqual(outcome["outcome"],"fail")
            self.assertFalse(outcome["metadata"]["verified"])
            self.assertIn("APPROVED",outcome["summary"])

    def test_actual_pixel_roi_differentiates_changed_and_unchanged(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow is optional; native visual tests require it")
        with tempfile.TemporaryDirectory() as root:
            before=Path(root)/"before.png"
            after=Path(root)/"after.png"
            one=Image.new("RGB",(128,128),(18,27,46))
            two=one.copy()
            for x in range(20,40):
                for y in range(20,40):
                    two.putpixel((x,y),(212,30,50))
            one.save(before);two.save(after)
            res=NATIVE.image_difference(before,after,[16,16,80,80],12)
            self.assertEqual(res["changedPixels"],400)
            self.assertAlmostEqual(res["differentFraction"],400/(80*80))
            same=NATIVE.image_difference(before,before,[16,16,80,80],12)
            self.assertEqual(same["changedPixels"],0)
            with self.assertRaises(RuntimeError):
                NATIVE.image_difference(before,after,[80,80,80,80],12)


if __name__=="__main__":
    unittest.main()
