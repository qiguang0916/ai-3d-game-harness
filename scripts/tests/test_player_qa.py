"""Self-contained tests for macOS Player QA rules; no Unity installation needed."""
import importlib.util
from pathlib import Path
import plistlib
import struct
import tempfile
import unittest
import zlib

SCRIPT = Path(__file__).resolve().parents[1] / "player_qa_runner.py"
SPEC = importlib.util.spec_from_file_location("player_qa_runner", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def chunk(tag, payload):
    body = tag + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))


def png(width=800, height=500):
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    row = b"\x00" + b"\xff\x00\x00\xff" * width
    pixels = zlib.compress(row * height)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", pixels) + chunk(b"IEND", b"")


class NativePlayerQaTests(unittest.TestCase):
    def test_qa22_requires_real_body_support_and_zero_errors(self):
        valid = {
            "flatFlipSupported": True,
            "horizontalYawSupported": True,
            "tipLeftFlipSupported": True,
            "baseContactTicks": 72,
            "yawContactTicks": 72,
            "tipLeftContactTicks": 72,
            "peakPenetrationMetres": .001,
            "unsafeFrames": 0,
            "cameraDriftFrames": 0,
            "errors": [],
        }
        self.assertEqual(MODULE.evaluate_replay("replay-qa22", valid), [])
        failed = {**valid, "horizontalYawSupported": False,
                  "yawContactTicks": 0, "errors": ["one failure"]}
        self.assertTrue(MODULE.evaluate_replay("replay-qa22", failed))

    def test_qa19_requires_real_bilateral_work_and_full_rotation(self):
        valid = {
            "leftPassed": True,
            "rightPassed": True,
            "inspectYawPassed": True,
            "inspectRollPassed": True,
            "returnPassed": True,
            "peakPenetrationMetres": .0002,
            "unsafeRenderFrames": 0,
            "errors": [],
        }
        self.assertEqual(MODULE.evaluate_replay("replay-qa19", valid), [])
        failed = {**valid, "inspectRollPassed": False}
        self.assertIn("inspectRollPassed failed",
                      MODULE.evaluate_replay("replay-qa19", failed))

    def test_png_decodes_and_rejects_incomplete_png(self):
        with tempfile.TemporaryDirectory() as root:
            file = Path(root) / "screenshot.png"
            file.write_bytes(png())
            self.assertTrue(MODULE.validate_png(file)[0])
            file.write_bytes(png()[:-9])
            self.assertFalse(MODULE.validate_png(file)[0])

    def test_bundle_path_cannot_escape_allowlisted_game_root(self):
        with tempfile.TemporaryDirectory() as root:
            allowed = Path(root) / "game"
            allowed.mkdir()
            app = allowed / "Workshop.app"
            macos = app / "Contents/MacOS"
            macos.mkdir(parents=True)
            (app / "Contents/Info.plist").write_bytes(
                plistlib.dumps({"CFBundleExecutable": "Workshop"})
            )
            (macos / "Workshop").write_text("not-a-real-executable")
            self.assertEqual(MODULE.checked_app(str(app), str(allowed))[0], app.resolve())
            other = Path(root) / "other"
            other.mkdir()
            with self.assertRaises(ValueError):
                MODULE.checked_app(str(app), str(other))


if __name__ == "__main__":
    unittest.main()
