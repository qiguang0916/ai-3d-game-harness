#!/usr/bin/env python3
"""Opt-in, ChatGPT-plan-authenticated Codex repair provider for Harness.

Every repair occurs in a NEW Git worktree outside the source project.
Nothing is merged or pushed. Tests must pass before this provider returns 0.
A separate human review is still necessary to promote the isolated patch.

HARNESS_REPAIR_APPROVED=1 is mandatory. This script does not bypass the Codex
workspace-write sandbox, approvals, or user account usage limits.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time


def process(argv, *, cwd=None, stdin=None, timeout=60):
    return subprocess.run(
        argv, cwd=cwd, input=stdin, text=True, capture_output=True,
        timeout=timeout, check=False
    )


def fail(message):
    print("CODEX_REPAIR_BLOCKED: " + message, file=sys.stderr)
    raise SystemExit(2)


def require_approved_environment():
    if os.getenv("HARNESS_REPAIR_APPROVED") != "1":
        fail("explicit HARNESS_REPAIR_APPROVED=1 required")
    required = ("HARNESS_REPAIR_SOURCE_REPO",
                "HARNESS_REPAIR_WORKTREE_ROOT",
                "HARNESS_REPAIR_TEST_ARGS_JSON")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        fail("missing required opt-in configuration: " + ", ".join(missing))
    source = Path(os.environ["HARNESS_REPAIR_SOURCE_REPO"]).expanduser().resolve(strict=True)
    parent = Path(os.environ["HARNESS_REPAIR_WORKTREE_ROOT"]).expanduser().resolve()
    if source == parent or parent.is_relative_to(source):
        fail("isolated repair worktrees must be outside the source repository")
    try:
        tests = json.loads(os.environ["HARNESS_REPAIR_TEST_ARGS_JSON"])
    except json.JSONDecodeError as error:
        fail("invalid test argv JSON: " + str(error))
    if not isinstance(tests, list) or len(tests) < 2 or not all(
        isinstance(arg, str) and arg for arg in tests
    ):
        fail("test args must be a nonempty JSON string array of argv")
    # This is a safety allowlist, not a shell. Env is explicitly trusted by
    # the user when authorizing this optional executor.
    allowed = {
        "npm": {"test", "run"},
        "python": {"-m"},
        "python3": {"-m"},
        "node": {"--test"},
    }
    executable = Path(tests[0]).name
    if executable not in allowed or tests[1] not in allowed[executable]:
        fail("test command requires explicit npm test/run, python -m or node --test")
    return source, parent, tests


def check_login(binary):
    result = process([str(binary), "login", "status"], timeout=20)
    if result.returncode != 0 or "Logged in using ChatGPT" not in (
        result.stdout + result.stderr
    ):
        fail("Codex must be logged in using ChatGPT plan; no API credentials used")


def read_failed_gate(payload):
    if payload.get("protocol") != "ai-3dgame-test-harness/repair-v1":
        fail("unsupported repair protocol")
    task = payload.get("task")
    gate = payload.get("gate")
    if not isinstance(task, dict) or not isinstance(gate, dict):
        fail("missing task or gate")
    task_id = str(task.get("id", ""))
    if not re.fullmatch(r"[A-Za-z0-9._-]+", task_id):
        fail("unsafe task identifier")
    if gate.get("passed") is not False:
        fail("only failed quality gates can request repair")
    evidence = payload.get("evidence")
    if not isinstance(evidence, list):
        fail("repair requires failed evidence")
    failed = []
    for item in evidence:
        if isinstance(item, dict) and item.get("outcome") == "fail":
            failed.append({
                "type": item.get("type"),
                "summary": str(item.get("summary", ""))[:1500],
                "uri": item.get("uri"),
            })
    if not failed:
        fail("no actual failing evidence to reproduce")
    return task_id, task, gate, failed


def git(*args, cwd=None, timeout=25):
    output = process(["git", *args], cwd=cwd, timeout=timeout)
    if output.returncode != 0:
        raise RuntimeError("git: " + (output.stderr or output.stdout)[-550:])
    return output.stdout.strip()


def persist(record, root, task_id, suffix):
    root.mkdir(parents=True, exist_ok=True)
    target = root / (task_id + "-" + suffix + ".json")
    target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    return target


def main():
    payload = json.load(sys.stdin)
    source, parent, tests = require_approved_environment()
    task_id, task, gate, failed = read_failed_gate(payload)
    codex = Path(os.getenv(
        "HARNESS_CODEX_BIN",
        "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex"
    )).expanduser()
    if not codex.is_file():
        fail("Codex CLI unavailable")
    check_login(codex)

    baseline = git("-C", str(source), "rev-parse", "HEAD")
    # Ensure this is a repository root, not an arbitrary nested directory.
    git_root = Path(git("-C", str(source), "rev-parse", "--show-toplevel")).resolve()
    if git_root != source:
        fail("source must equal Git worktree root")
    signature = hashlib.sha256((task_id + baseline).encode()).hexdigest()[:10]
    branch = "harness/repair-" + task_id.lower() + "-" + signature
    parent.mkdir(parents=True, exist_ok=True)
    target = parent / branch.replace("/", "-")
    if target.exists():
        fail("isolated worktree already exists; refusing overwrite")

    repo_state_before = git("-C", str(source), "status", "--porcelain")
    begin = time.time()
    record = {
        "taskId": task_id, "source": str(source), "baseCommit": baseline,
        "repairBranch": branch, "worktree": str(target),
        "startedUnix": begin, "approved": True,
        "status": "INIT", "sourceGitStatusBefore": repo_state_before,
    }
    reports = Path(payload["projectRoot"]).resolve() / ".project" / "repairs"
    try:
        git("-C", str(source), "worktree", "add", "-b", branch,
            str(target), baseline, timeout=60)
        record["status"] = "RUNNING"
        prompt = (
            "Repair only the listed reproducible failure in THIS ISOLATED Git "
            "worktree. Do not edit any other directory, asset master or "
            "global configuration. Never bypass test assertions, adjust "
            "thresholds, forge QA evidence or erase regressions. "
            "Do not push or merge. Make the smallest correct fix, run no "
            "network install without user approval, and document the change.\n\n"
            + json.dumps({
                "task": task, "failedGate": gate,
                "failedEvidence": failed, "baseCommit": baseline
            }, ensure_ascii=False, indent=2)
        )
        invocation = [
            str(codex), "exec", "--sandbox", "workspace-write", "-C",
            str(target),
        ]
        model = os.getenv("HARNESS_REPAIR_MODEL")
        if model:
            invocation += ["--model", model]
        invocation.append("-")
        timeout = min(1800, max(30, int(os.getenv("HARNESS_REPAIR_TIMEOUT", "1200"))))
        # Critically pass the repair prompt via stdin. No broken command
        # execution without instructions, no dangerously-bypass flag.
        generated = process(invocation, cwd=target, stdin=prompt, timeout=timeout)
        record["codexExit"] = generated.returncode
        record["codexStdoutTail"] = generated.stdout[-10000:]
        record["codexStderrTail"] = generated.stderr[-3000:]
        if generated.returncode != 0:
            raise RuntimeError("Codex repair failed (nonzero exit)")

        changed = git("-C", str(target), "status", "--porcelain")
        if not changed:
            raise RuntimeError("no code changes found: refusing no-op repair")
        record["worktreeGitStatus"] = changed[:12000]

        tested = process(tests, cwd=target,
                         timeout=min(1800, timeout))
        record["testCommand"] = tests
        record["testExit"] = tested.returncode
        record["testStdoutTail"] = tested.stdout[-10000:]
        record["testStderrTail"] = tested.stderr[-4000:]
        if tested.returncode != 0:
            raise RuntimeError("post-repair verification failed; not accepted")

        # The source checkout is not modified, merged or pushed. Its Git
        # metadata lists an additional worktree, which is expected.
        source_after = git("-C", str(source), "status", "--porcelain")
        if source_after != repo_state_before:
            raise RuntimeError("source checkout unexpectedly changed; manual review required")
        record["status"] = "TESTS_PASS_REVIEW_REQUIRED"
        record["sourceGitStatusAfter"] = source_after
        record["finishedUnix"] = time.time()
        report = persist(record, reports, task_id, signature)
        print("Repair verified in isolated worktree:", str(target))
        print("Review and commit the patch before merging; report:", str(report))
    except subprocess.TimeoutExpired as exc:
        record["status"] = "TIMEOUT"
        record["error"] = str(exc)
        record["finishedUnix"] = time.time()
        persist(record, reports, task_id, signature)
        fail("Codex/test timeout; worktree preserved for inspection")
    except Exception as exc:
        record["status"] = "FAILED"
        record["error"] = str(exc)
        record["finishedUnix"] = time.time()
        persist(record, reports, task_id, signature)
        fail(str(exc))


if __name__ == "__main__":
    main()
