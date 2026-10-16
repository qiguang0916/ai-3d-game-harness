"""Distribution smoke-test: reproducible, hash-verified, no user private files."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SOURCE=Path(__file__).resolve().parents[1]
ROOT=SOURCE.parent


def load(name):
    spec=importlib.util.spec_from_file_location(name,SOURCE/(name+".py"))
    assert spec and spec.loader
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


class ReleasePackageTests(unittest.TestCase):
    def test_release_bundle_and_tamper_detection(self):
        if not (ROOT/"dist/cli.js").exists():
            self.skipTest("npm run build required")
        verifier=load("verify_release")
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)
            generated=subprocess.run(
                [sys.executable,str(SOURCE/"make_release.py"),
                 "--out",str(dest)],
                capture_output=True,text=True,timeout=30)
            self.assertEqual(generated.returncode,0,generated.stderr)
            files=list(dest.glob("*.tar.gz"))
            self.assertEqual(len(files),1)
            checked=verifier.verify(files[0])
            self.assertTrue(checked["verified"])
            self.assertGreater(checked["files"],100)
            names=(dest/"RELEASE_MANIFEST.json").read_text()
            manifest=json.loads(names)
            self.assertIn("bin/ai3d-harness",manifest["files"])
            self.assertNotIn(".local-pilot",names)
            raw=bytearray(files[0].read_bytes())
            raw[-10]^=1
            corrupted=dest/"corrupted.tar.gz"
            corrupted.write_bytes(raw)
            with self.assertRaises(Exception):
                verifier.verify(corrupted)


if __name__=="__main__":
    unittest.main()
