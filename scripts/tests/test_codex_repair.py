"""Safe end-to-end tests of the opt-in Codex repair adapter.

Uses a temporary fake Codex executable. NEVER calls a real paid model.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


WRAPPER = Path(__file__).resolve().parents[1] / "codex_repair_provider.py"
PAYLOAD = {
    "protocol": "ai-3d-game-harness/repair-v1",
    "projectRoot": "",
    "task": {"id": "T-REPAIR-SAFE"},
    "gate": {"passed": False},
    "evidence": [{"outcome": "fail", "type": "test",
                  "summary": "test_fix fails while state.txt is pending"}],
    "state": {},
}


def run(argv, cwd=None, env=None, stdin=None):
    return subprocess.run(argv, cwd=cwd, env=env, input=stdin, text=True,
                          capture_output=True, check=False, timeout=30)


class SafeRepairTests(unittest.TestCase):
    def test_no_approval_blocks_before_creating_worktree(self):
        with tempfile.TemporaryDirectory() as root:
            payload = {**PAYLOAD, "projectRoot": root}
            env = dict(os.environ)
            for key in ("HARNESS_REPAIR_APPROVED", "HARNESS_REPAIR_WORKTREE_ROOT",
                        "HARNESS_REPAIR_SOURCE_REPO"):
                env.pop(key, None)
            reply = run([sys.executable, str(WRAPPER)], env=env,
                        stdin=json.dumps(payload))
            self.assertEqual(reply.returncode, 2)
            self.assertIn("HARNESS_REPAIR_APPROVED", reply.stderr)
            self.assertFalse((Path(root) / ".project").exists())

    def test_authorized_fake_codex_only_edits_isolated_clone(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root).resolve()
            source = root / "source"
            source.mkdir()
            run(["git", "init", "-b", "main", str(source)])
            (source / "state.txt").write_text("pending\n")
            (source / "test_fix.py").write_text(
                "import unittest\n"
                "from pathlib import Path\n"
                "class Check(unittest.TestCase):\n"
                " def test_fix(self):\n"
                "  self.assertEqual(Path('state.txt').read_text(),'fixed\\n')\n"
            )
            self.assertEqual(run(["git", "add", "-A"], cwd=source).returncode, 0)
            commit = run(["git", "-c", "user.name=QA", "-c",
                          "user.email=qa@example.invalid", "commit", "-m", "base"],
                         cwd=source)
            self.assertEqual(commit.returncode, 0, commit.stderr)
            before = run(["git", "status", "--porcelain"], cwd=source).stdout
            fake = root / "fake-codex"
            fake.write_text(
                "#!/usr/bin/env python3\n"
                "import pathlib,sys\n"
                "if sys.argv[1:3]==['login','status']:\n"
                " print('Logged in using ChatGPT')\n"
                "elif sys.argv[1]=='exec':\n"
                " prompt=sys.stdin.read()\n"
                " assert 'failedEvidence' in prompt\n"
                " pathlib.Path('state.txt').write_text('fixed\\n')\n"
                " print('fake Codex repaired test state')\n"
                "else:sys.exit(4)\n"
            )
            fake.chmod(0o755)
            env = dict(os.environ)
            env.update({
                "HARNESS_REPAIR_APPROVED": "1",
                "HARNESS_REPAIR_SOURCE_REPO": str(source),
                "HARNESS_REPAIR_WORKTREE_ROOT": str(root / "repairs"),
                "HARNESS_REPAIR_TEST_ARGS_JSON":
                    json.dumps([sys.executable, "-m", "unittest", "discover"]),
                "HARNESS_CODEX_BIN": str(fake),
                "HARNESS_REPAIR_TIMEOUT": "20",
            })
            payload = {**PAYLOAD, "projectRoot": str(root / "harness")}
            reply = run([sys.executable, str(WRAPPER)], env=env,
                        stdin=json.dumps(payload))
            self.assertEqual(reply.returncode, 0, reply.stderr)
            self.assertIn("Review and commit the patch", reply.stdout)
            self.assertEqual((source / "state.txt").read_text(), "pending\n")
            self.assertEqual(run(["git", "status", "--porcelain"],
                                 cwd=source).stdout, before)
            reports = list((root / "harness/.project/repairs").glob("*.json"))
            self.assertEqual(len(reports), 1)
            report = json.loads(reports[0].read_text())
            self.assertEqual(report["status"], "TESTS_PASS_REVIEW_REQUIRED")
            self.assertEqual(report["testExit"], 0)
            self.assertEqual((Path(report["worktree"]) / "state.txt").read_text(),
                             "fixed\n")


if __name__ == "__main__":
    unittest.main()
