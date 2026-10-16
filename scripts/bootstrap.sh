#!/usr/bin/env bash
# Local, self-contained installation. No sudo, global config writes, or
# automatic Unity/Codex modifications.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js >=20 is required." >&2; exit 2
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required." >&2; exit 2
fi
VERSION="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$VERSION" -lt 20 ]]; then
  echo "Node.js >=20 required; installed $(node --version)" >&2; exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python3 is required for macOS game QA." >&2; exit 2
fi
echo "[1/5] Installing pinned Node dependencies"
npm ci --ignore-scripts --no-audit --no-fund
echo "[2/5] Building CLI"
npm run build
echo "[3/5] Running Node QA regression"
npm test
echo "[4/5] Running Python QA regression"
python3 -m unittest discover -s scripts/tests -v
echo "[5/5] Optional macOS native-driver syntax check"
if [[ "$(uname -s)" == "Darwin" ]]; then
  if command -v swiftc >/dev/null 2>&1; then
    swiftc -typecheck scripts/macos_input_driver.swift
  else
    echo "Swift toolchain missing: native macOS input adapter unavailable"
  fi
fi
echo
echo "INSTALLATION READY"
echo "  $ROOT/bin/ai3d-harness doctor <config.json>"
echo "  $ROOT/bin/ai3d-game-qa --help"
echo "Note: Unity Editor connection, actual game passing, and macOS"
echo "Accessibility are separate runtime gates; bootstrap does not bypass them."
